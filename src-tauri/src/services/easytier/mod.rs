use crate::i18n::I18nError;
use crate::i18n_err;
use crate::state::app_state::AppState;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

/// EasyTier 核心组件存放目录
const CORE_DIR_NAME: &str = "core";
/// 核心组件可执行文件名
#[cfg(target_os = "windows")]
const CORE_BINARY: &str = "easytier-core.exe";
#[cfg(not(target_os = "windows"))]
const CORE_BINARY: &str = "easytier-core";
/// 命令行工具文件名，用于读取虚拟地址与节点信息
#[cfg(target_os = "windows")]
const CLI_BINARY: &str = "easytier-cli.exe";
#[cfg(not(target_os = "windows"))]
const CLI_BINARY: &str = "easytier-cli";
/// 本机 RPC 端口，避开 EasyTier 默认的 15888，防止与已运行的实例冲突
const RPC_PORTAL: &str = "127.0.0.1:15889";
/// 未填写对等节点时使用的蓝柚官方中转节点（用域名，换服务器只需改 DNS 解析）
const PUBLIC_SHARED_NODE: &str = "tcp://gz.easytier.aetrn.cn:11010";
/// EasyTier 官方下载页，用于解析当前稳定版的发行包名称
const DOWNLOAD_PAGE: &str = "https://easytier.cn/guide/download.html";
/// EasyTier 最新版本信息接口，作为下载页解析失败时的备用来源
const RELEASE_API: &str = "https://api.github.com/repos/EasyTier/EasyTier/releases/latest";
/// GitHub 发行包下载加速节点，按顺序尝试
const DOWNLOAD_MIRRORS: [&str; 3] = [
    "https://ghfast.top/",
    "https://hk.gh-proxy.org/",
    "https://cdn.gh-proxy.org/",
];
/// 日志缓冲区上限，避免长时间运行占用过多内存
const MAX_LOG_ENTRIES: usize = 400;
/// 启动后等待核心就绪的时间
const IP_PROBE_DELAY: Duration = Duration::from_secs(3);
/// 两次虚拟地址探测之间的最小间隔
const IP_PROBE_INTERVAL: Duration = Duration::from_secs(8);

/// 联机启动参数
#[derive(Debug, Clone, Deserialize)]
pub struct EasytierConfig {
    /// 网络名称，同一网络的成员必须一致
    pub network_name: String,
    /// 网络密钥，同一网络的成员必须一致
    pub network_secret: String,
    /// 对等节点地址列表
    #[serde(default)]
    pub peers: Vec<String>,
    /// 虚拟 IPv4 地址，留空时由 EasyTier 自动分配
    #[serde(default)]
    pub virtual_ip: String,
}

/// 单条联机日志
#[derive(Debug, Clone, Serialize)]
pub struct EasytierLogEntry {
    pub level: String,
    pub message: String,
    pub timestamp: i64,
}

/// 联机运行时状态
pub struct EasytierRuntime {
    /// 核心进程句柄
    pub child: Option<Child>,
    /// 核心进程 PID
    pub pid: Option<u32>,
    /// 当前网络名称
    pub network_name: String,
    /// 配置的虚拟地址（空字符串表示自动分配）
    pub virtual_ip: String,
    /// 是否由 EasyTier 自动分配虚拟地址
    pub auto_ip: bool,
    /// 启动时间（毫秒时间戳）
    pub started_at: Option<i64>,
    /// 运行日志
    pub logs: Arc<Mutex<Vec<EasytierLogEntry>>>,
    /// 从核心输出中解析到的虚拟地址
    pub detected_ip: Arc<Mutex<Option<String>>>,
    /// 上次探测虚拟地址的时间
    pub last_ip_probe: Option<Instant>,
}

impl Default for EasytierRuntime {
    fn default() -> Self {
        Self {
            child: None,
            pid: None,
            network_name: String::new(),
            virtual_ip: String::new(),
            auto_ip: true,
            started_at: None,
            logs: Arc::new(Mutex::new(Vec::new())),
            detected_ip: Arc::new(Mutex::new(None)),
            last_ip_probe: None,
        }
    }
}

/// 返回给前端的联机状态
#[derive(Debug, Clone, Serialize)]
pub struct EasytierStatus {
    /// 核心组件是否已安装
    pub installed: bool,
    /// 核心组件版本
    pub version: String,
    /// 是否正在联机
    pub running: bool,
    /// 核心进程 PID
    pub pid: Option<u32>,
    /// 当前网络名称
    pub network_name: String,
    /// 配置的虚拟地址
    pub virtual_ip: String,
    /// 是否自动分配虚拟地址
    pub auto_ip: bool,
    /// 启动时间（毫秒时间戳）
    pub started_at: Option<i64>,
    /// 探测到的虚拟地址
    pub detected_ip: Option<String>,
    /// 运行日志
    pub logs: Vec<EasytierLogEntry>,
}

/// 安装完成后返回的信息
#[derive(Debug, Clone, Serialize)]
pub struct EasytierInstallInfo {
    pub installed: bool,
    pub version: String,
    pub path: String,
}

/// EasyTier 数据目录
fn get_easytier_dir(state: &AppState) -> PathBuf {
    state.launcher_dir.join("easytier")
}

/// 核心组件目录
fn get_core_dir(state: &AppState) -> PathBuf {
    get_easytier_dir(state).join(CORE_DIR_NAME)
}

/// 版本信息文件
fn get_version_file(state: &AppState) -> PathBuf {
    get_easytier_dir(state).join("version.txt")
}

/// 在目录中按文件名查找文件，最多向下查找三层
fn find_file(dir: &Path, file_name: &str, depth: usize) -> Option<PathBuf> {
    if depth > 3 || !dir.is_dir() {
        return None;
    }

    let entries = std::fs::read_dir(dir).ok()?;
    let mut sub_dirs = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if path.file_name().and_then(|name| name.to_str()) == Some(file_name) {
                return Some(path);
            }
        } else if path.is_dir() {
            sub_dirs.push(path);
        }
    }

    for sub_dir in sub_dirs {
        if let Some(found) = find_file(&sub_dir, file_name, depth + 1) {
            return Some(found);
        }
    }

    None
}

/// 查找已安装的核心组件
pub fn find_core(state: &AppState) -> Option<PathBuf> {
    find_file(&get_core_dir(state), CORE_BINARY, 0)
}

/// 查找已安装的命令行工具
fn find_cli(state: &AppState) -> Option<PathBuf> {
    find_file(&get_core_dir(state), CLI_BINARY, 0)
}

/// 读取已安装的核心组件信息
fn get_installed_info(state: &AppState) -> (bool, String) {
    let installed = find_core(state).is_some();
    let version = std::fs::read_to_string(get_version_file(state))
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    (installed, version)
}

/// 当前系统对应的 EasyTier 发行包平台标识
fn current_platform() -> Result<(&'static str, &'static str), I18nError> {
    let os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        return Err(i18n_err!("errors.easytier.unsupportedPlatform"));
    };

    let arch = if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else if cfg!(target_arch = "aarch64") {
        // Windows 发行包使用 arm64 标识，其他平台使用 aarch64
        if cfg!(target_os = "windows") {
            "arm64"
        } else {
            "aarch64"
        }
    } else if cfg!(target_arch = "x86") {
        "i686"
    } else {
        return Err(i18n_err!("errors.easytier.unsupportedPlatform"));
    };

    Ok((os, arch))
}

/// 去除日志中的 ANSI 颜色控制字符
fn strip_ansi(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(next) = chars.next() {
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else {
            output.push(ch);
        }
    }

    output
}

/// 从输出中提取虚拟 IPv4 地址
fn extract_virtual_ipv4(line: &str) -> Option<String> {
    let lowered = line.to_lowercase();
    if !lowered.contains("virtual ip") {
        return None;
    }

    for token in line.split_whitespace() {
        let token = token.trim_matches(|ch: char| !ch.is_ascii_digit() && ch != '.' && ch != '/');
        let candidate = token.split('/').next().unwrap_or(token);
        if candidate.parse::<std::net::Ipv4Addr>().is_ok() {
            return Some(candidate.to_string());
        }
    }

    None
}

/// 追加一条日志，超过上限时丢弃最早记录
fn push_log(logs: &Arc<Mutex<Vec<EasytierLogEntry>>>, message: String) {
    let lowered = message.to_lowercase();
    let level = if lowered.contains("error") || lowered.contains("failed") {
        "error"
    } else if lowered.contains("warn") {
        "warn"
    } else {
        "info"
    };

    let entry = EasytierLogEntry {
        level: level.to_string(),
        message,
        timestamp: now_millis(),
    };

    if let Ok(mut buffer) = logs.lock() {
        if buffer.len() >= MAX_LOG_ENTRIES {
            let overflow = buffer.len() - MAX_LOG_ENTRIES + 1;
            buffer.drain(0..overflow);
        }
        buffer.push(entry);
    }
}

/// 读取核心进程的标准输出/错误输出并写入日志缓冲区
fn spawn_log_reader<R: Read + Send + 'static>(
    reader: R,
    logs: Arc<Mutex<Vec<EasytierLogEntry>>>,
    detected_ip: Arc<Mutex<Option<String>>>,
) {
    std::thread::spawn(move || {
        let buffered = BufReader::new(reader);
        for line in buffered.lines() {
            let Ok(line) = line else { break };
            let message = strip_ansi(&line);
            if message.trim().is_empty() {
                continue;
            }

            if detected_ip.lock().map(|value| value.is_none()).unwrap_or(false) {
                if let Some(ip) = extract_virtual_ipv4(&message) {
                    if let Ok(mut value) = detected_ip.lock() {
                        *value = Some(ip);
                    }
                }
            }

            push_log(&logs, message);
        }
    });
}

/// 为子进程设置 Windows 下的隐藏控制台参数
fn apply_no_window(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = command;
    }
}

/// 通过命令行工具读取当前节点的虚拟地址
fn query_virtual_ip(state: &AppState) -> Option<String> {
    let cli = find_cli(state)?;
    let core_dir = cli.parent()?.to_path_buf();

    let mut command = Command::new(&cli);
    command
        .arg("-p")
        .arg(RPC_PORTAL)
        .arg("node")
        .current_dir(&core_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    apply_no_window(&mut command);

    let mut child = command.spawn().ok()?;

    // 命令行工具连接 RPC 后应尽快退出，超时则直接终止，避免阻塞状态刷新
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(_) => {
                let _ = child.kill();
                return None;
            }
        }
    }

    let output = child.wait_with_output().ok()?;
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        if let Some(ip) = extract_virtual_ipv4(line) {
            return Some(ip);
        }
    }

    None
}

/// 获取当前毫秒时间戳
fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

/// 刷新进程状态：进程已退出时清理运行时信息
fn refresh_running_state(runtime: &mut EasytierRuntime) -> bool {
    let exited = match runtime.child.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(Some(_)) => true,
            Ok(None) => false,
            Err(_) => false,
        },
        None => false,
    };

    if exited {
        runtime.child = None;
        runtime.pid = None;
        runtime.started_at = None;
        runtime.last_ip_probe = None;
        if let Ok(mut value) = runtime.detected_ip.lock() {
            *value = None;
        }
        return false;
    }

    runtime.child.is_some()
}

/// 生成联机状态快照
pub fn snapshot(state: &AppState) -> EasytierStatus {
    let mut runtime = state
        .easytier
        .lock()
        .unwrap_or_else(|error| error.into_inner());

    let running = refresh_running_state(&mut runtime);

    // 自动分配地址时需要从核心读取实际结果，按固定间隔探测，避免频繁拉起子进程
    if running && runtime.auto_ip {
        if let Some(started_at) = runtime.started_at {
            let elapsed = now_millis().saturating_sub(started_at) as u64;
            if elapsed >= IP_PROBE_DELAY.as_millis() as u64 {
                let can_probe = runtime
                    .last_ip_probe
                    .map(|last| last.elapsed() >= IP_PROBE_INTERVAL)
                    .unwrap_or(true);
                if can_probe {
                    runtime.last_ip_probe = Some(Instant::now());
                    let detected = runtime
                        .detected_ip
                        .lock()
                        .map(|value| value.clone())
                        .unwrap_or(None);
                    if detected.is_none() {
                        if let Some(ip) = query_virtual_ip(state) {
                            if let Ok(mut value) = runtime.detected_ip.lock() {
                                *value = Some(ip);
                            }
                        }
                    }
                }
            }
        }
    }

    let detected_ip = runtime
        .detected_ip
        .lock()
        .map(|value| value.clone())
        .unwrap_or(None);
    let logs = runtime
        .logs
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default();
    let (installed, version) = get_installed_info(state);

    EasytierStatus {
        installed,
        version,
        running,
        pid: runtime.pid,
        network_name: runtime.network_name.clone(),
        virtual_ip: runtime.virtual_ip.clone(),
        auto_ip: runtime.auto_ip,
        started_at: runtime.started_at,
        detected_ip,
        logs,
    }
}

/// 启动 EasyTier 联机
pub fn start(state: &AppState, config: EasytierConfig) -> Result<EasytierStatus, I18nError> {
    let network_name = config.network_name.trim().to_string();
    let network_secret = config.network_secret.trim().to_string();
    let mut virtual_ip = config.virtual_ip.trim().to_string();

    if network_name.is_empty() {
        return Err(i18n_err!("errors.easytier.emptyNetworkName"));
    }
    if network_secret.is_empty() {
        return Err(i18n_err!("errors.easytier.emptyNetworkSecret"));
    }
    // 只填写 IP 时补全为 /24 网段，避免核心组件因格式不完整而启动失败
    if !virtual_ip.is_empty() && !virtual_ip.contains('/') {
        virtual_ip.push_str("/24");
    }

    let core_path = find_core(state).ok_or(i18n_err!("errors.easytier.notInstalled"))?;

    let mut runtime = state
        .easytier
        .lock()
        .unwrap_or_else(|error| error.into_inner());

    if refresh_running_state(&mut runtime) {
        return Err(i18n_err!("errors.easytier.alreadyRunning"));
    }

    let mut peers: Vec<String> = config
        .peers
        .iter()
        .map(|peer| peer.trim().to_string())
        .filter(|peer| !peer.is_empty())
        .collect();
    if peers.is_empty() {
        peers.push(PUBLIC_SHARED_NODE.to_string());
    }

    let mut command = Command::new(&core_path);
    command
        .arg("--network-name")
        .arg(&network_name)
        .arg("--network-secret")
        .arg(&network_secret)
        .arg("--instance-name")
        .arg("lanyou-launcher")
        .arg("--rpc-portal")
        .arg(RPC_PORTAL);
    for peer in &peers {
        command.arg("-p").arg(peer);
    }
    if virtual_ip.is_empty() {
        command.arg("-d");
    } else {
        command.arg("-i").arg(&virtual_ip);
    }
    // Windows 下转发本机 UDP 广播，让「对局域网开放」的房间能被好友列表自动发现
    #[cfg(target_os = "windows")]
    command.arg("--enable-udp-broadcast-relay").arg("true");
    command
        .current_dir(core_path.parent().unwrap_or(Path::new(".")))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_no_window(&mut command);

    let mut child = command
        .spawn()
        .map_err(|error| i18n_err!("errors.easytier.spawnFailed", error))?;
    let pid = child.id();

    // 新一轮联机使用独立的日志缓冲，便于观察本次连接过程
    let logs = Arc::new(Mutex::new(Vec::new()));
    let detected_ip = Arc::new(Mutex::new(None));
    if let Some(stdout) = child.stdout.take() {
        spawn_log_reader(stdout, logs.clone(), detected_ip.clone());
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_log_reader(stderr, logs.clone(), detected_ip.clone());
    }

    runtime.child = Some(child);
    runtime.pid = Some(pid);
    runtime.network_name = network_name;
    runtime.virtual_ip = virtual_ip.clone();
    runtime.auto_ip = virtual_ip.is_empty();
    runtime.started_at = Some(now_millis());
    runtime.logs = logs;
    runtime.detected_ip = detected_ip;
    runtime.last_ip_probe = None;

    // 必须先释放运行时锁，状态快照会再次获取同一把锁
    drop(runtime);

    Ok(snapshot(state))
}

/// 停止 EasyTier 联机
pub fn stop(state: &AppState) -> Result<EasytierStatus, I18nError> {
    {
        let mut runtime = state
            .easytier
            .lock()
            .unwrap_or_else(|error| error.into_inner());

        if let Some(mut child) = runtime.child.take() {
            child
                .kill()
                .map_err(|error| i18n_err!("errors.easytier.stopFailed", error))?;
            let _ = child.wait();
        }

        runtime.pid = None;
        runtime.started_at = None;
        runtime.last_ip_probe = None;
        let detected_ip = runtime.detected_ip.clone();
        drop(runtime);
        let _ = detected_ip.lock().map(|mut value| *value = None);
    }

    Ok(snapshot(state))
}

/// 清空当前联机日志
pub fn clear_logs(state: &AppState) {
    if let Ok(runtime) = state.easytier.lock() {
        if let Ok(mut logs) = runtime.logs.lock() {
            logs.clear();
        }
    }
}

/// 关闭启动器时终止联机进程，避免残留虚拟网卡进程
pub fn shutdown(state: &AppState) {
    let runtime = state.easytier.lock();
    if let Ok(mut runtime) = runtime {
        if let Some(mut child) = runtime.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        runtime.pid = None;
        runtime.started_at = None;
    }
}

/// 解压发行包到核心目录
fn extract_zip(archive_path: &Path, dest: &Path) -> Result<(), I18nError> {
    let file = std::fs::File::open(archive_path)
        .map_err(|error| i18n_err!("errors.easytier.extractFailed", error))?;
    let mut archive = zip::ZipArchive::new(BufReader::new(file))
        .map_err(|error| i18n_err!("errors.easytier.extractFailed", error))?;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| i18n_err!("errors.easytier.extractFailed", error))?;
        let name = entry.name().to_string();
        if name.contains("..") {
            return Err(i18n_err!("errors.easytier.extractFailed", "invalid entry"));
        }

        let out_path = dest.join(&name);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)
                .map_err(|error| i18n_err!("errors.easytier.extractFailed", error))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|error| i18n_err!("errors.easytier.extractFailed", error))?;
            }
            let mut out_file = std::fs::File::create(&out_path)
                .map_err(|error| i18n_err!("errors.easytier.extractFailed", error))?;
            std::io::copy(&mut entry, &mut out_file)
                .map_err(|error| i18n_err!("errors.easytier.extractFailed", error))?;
        }
    }

    Ok(())
}

/// 为可执行文件添加执行权限
fn ensure_executable(path: &Path) -> Result<(), I18nError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = std::fs::metadata(path)
            .map_err(|error| i18n_err!("errors.easytier.extractFailed", error))?;
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(path, permissions)
            .map_err(|error| i18n_err!("errors.easytier.extractFailed", error))?;
    }

    #[cfg(not(unix))]
    {
        let _ = path;
    }

    Ok(())
}

/// 从官方下载页解析当前稳定版的发行包名称与版本号
fn parse_asset_from_page(html: &str, os: &str, arch: &str) -> Option<(String, String)> {
    let marker = format!("easytier-{}-{}-v", os, arch);
    let start = html.find(&marker)?;
    let rest = &html[start..];
    let end = rest.find(".zip")? + 4;
    let file_name = rest[..end].to_string();

    let version = file_name
        .trim_end_matches(".zip")
        .rsplit("-v")
        .next()?
        .to_string();
    if !version
        .chars()
        .next()
        .map(|ch| ch.is_ascii_digit())
        .unwrap_or(false)
    {
        return None;
    }

    Some((file_name, version))
}

/// 解析当前平台对应的发行包名称与版本，优先读取官方下载页
async fn resolve_release(
    state: &AppState,
    os: &str,
    arch: &str,
) -> Result<(String, String), I18nError> {
    if let Ok(response) = state.http_client.get(DOWNLOAD_PAGE).send().await {
        if response.status().is_success() {
            if let Ok(html) = response.text().await {
                if let Some((file_name, version)) = parse_asset_from_page(&html, os, arch) {
                    return Ok((file_name, version));
                }
            }
        }
    }

    // 下载页不可用时回退到 GitHub API
    let response = state
        .http_client
        .get(RELEASE_API)
        .header("User-Agent", "LanyouLauncher")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| i18n_err!("errors.easytier.fetchReleaseFailed", error))?;

    if !response.status().is_success() {
        return Err(
            I18nError::new("errors.easytier.fetchReleaseFailed")
                .param("detail", response.status().to_string()),
        );
    }

    let release: serde_json::Value = response
        .json()
        .await
        .map_err(|error| i18n_err!("errors.easytier.fetchReleaseFailed", error))?;
    let version = release
        .get("tag_name")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();

    let assets = release
        .get("assets")
        .and_then(|value| value.as_array())
        .ok_or_else(|| i18n_err!("errors.easytier.noAsset"))?;

    for asset in assets {
        let Some(name) = asset.get("name").and_then(|value| value.as_str()) else {
            continue;
        };
        let matches_platform = name.starts_with("easytier-")
            && name.ends_with(".zip")
            && name.contains(&format!("-{}-", os))
            && name.contains(&format!("-{}-", arch));
        if matches_platform {
            return Ok((name.to_string(), version));
        }
    }

    Err(i18n_err!("errors.easytier.noAsset"))
}

/// 下载发行包到本地，失败时返回错误详情
async fn download_asset(
    state: &AppState,
    app: &tauri::AppHandle,
    url: &str,
    archive_path: &Path,
) -> Result<(), String> {
    let response = state
        .http_client
        .get(url)
        .timeout(Duration::from_secs(300))
        .header("User-Agent", "LanyouLauncher")
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let total = response.content_length().unwrap_or(0);
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut file = std::fs::File::create(archive_path).map_err(|error| error.to_string())?;
    let mut last_emit = Instant::now() - Duration::from_millis(100);
    let _ = app.emit("easytier_install_progress", 0.0);

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        file.write_all(&chunk).map_err(|error| error.to_string())?;
        downloaded += chunk.len() as u64;

        // 按数据块实时更新，并做 50ms 节流，避免进度条大幅跳跃
        if total > 0 && last_emit.elapsed() >= Duration::from_millis(50) {
            let percent = (downloaded as f64 / total as f64 * 100.0).min(99.9);
            let _ = app.emit("easytier_install_progress", percent);
            last_emit = Instant::now();
        }
    }

    Ok(())
}

/// 下载并安装最新的 EasyTier 核心组件
pub async fn install(
    state: &AppState,
    app: &tauri::AppHandle,
) -> Result<EasytierInstallInfo, I18nError> {
    let (os, arch) = current_platform()?;
    let easytier_dir = get_easytier_dir(state);
    let core_dir = get_core_dir(state);
    let downloads_dir = easytier_dir.join("downloads");
    std::fs::create_dir_all(&downloads_dir)
        .map_err(|error| i18n_err!("errors.file.createDirFailed", error))?;

    let (file_name, version) = resolve_release(state, os, arch).await?;
    let archive_path = downloads_dir.join(&file_name);
    let direct_url = format!(
        "https://github.com/EasyTier/EasyTier/releases/download/v{}/{}",
        version, file_name
    );

    // 国内网络直连 GitHub 经常失败，依次尝试官方提供的加速节点
    let mut last_error = String::new();
    let mut downloaded = false;
    let mut candidates: Vec<String> = DOWNLOAD_MIRRORS
        .iter()
        .map(|mirror| format!("{}{}", mirror, direct_url))
        .collect();
    candidates.push(direct_url);

    for candidate in candidates {
        match download_asset(state, app, &candidate, &archive_path).await {
            Ok(()) => {
                downloaded = true;
                break;
            }
            Err(detail) => last_error = detail,
        }
    }

    if !downloaded {
        return Err(
            I18nError::new("errors.easytier.downloadFailed").param("detail", last_error)
        );
    }
    let _ = app.emit("easytier_install_progress", 100);

    // 覆盖旧版本前先停止正在运行的核心，避免文件被占用
    shutdown(state);
    if core_dir.exists() {
        std::fs::remove_dir_all(&core_dir)
            .map_err(|error| i18n_err!("errors.easytier.extractFailed", error))?;
    }
    std::fs::create_dir_all(&core_dir)
        .map_err(|error| i18n_err!("errors.file.createDirFailed", error))?;

    extract_zip(&archive_path, &core_dir)?;

    let core_path = find_file(&core_dir, CORE_BINARY, 0)
        .ok_or_else(|| i18n_err!("errors.easytier.binaryMissing"))?;
    ensure_executable(&core_path)?;

    std::fs::write(get_version_file(state), &version)
        .map_err(|error| i18n_err!("errors.easytier.extractFailed", error))?;
    let _ = std::fs::remove_file(&archive_path);

    Ok(EasytierInstallInfo {
        installed: true,
        version,
        path: core_path.to_string_lossy().to_string(),
    })
}
