use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::launch::{CrashInfo, LaunchConfig};
use crate::models::settings::{DownloadSource, Settings};
use crate::state::app_state::AppState;
use log::info;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::time::{Duration, SystemTime};
use tauri::Emitter;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 读取启动器保存的语言，读取失败时回退到默认中文
fn read_launcher_language(launcher_dir: &Path) -> String {
    let settings_file = crate::utils::paths::get_settings_file(launcher_dir);
    std::fs::read_to_string(settings_file)
        .ok()
        .and_then(|content| serde_json::from_str::<Settings>(&content).ok())
        .map(|settings| settings.language)
        .filter(|language| !language.trim().is_empty())
        .unwrap_or_else(|| Settings::default().language)
}

/// 将启动器语言同步为游戏内语言，避免每次进游戏都要手动选择语言
fn sync_game_language(game_dir: &Path, language: &str) {
    let game_lang = if language.to_lowercase().starts_with("zh") {
        "zh_cn"
    } else {
        "en_us"
    };

    let options_file = game_dir.join("options.txt");
    let content = std::fs::read_to_string(&options_file).unwrap_or_default();
    let mut lines: Vec<String> = content.lines().map(str::to_string).collect();

    if let Some(line) = lines.iter_mut().find(|line| line.starts_with("lang:")) {
        *line = format!("lang:{}", game_lang);
    } else {
        lines.push(format!("lang:{}", game_lang));
    }

    if std::fs::create_dir_all(game_dir).is_ok() {
        let _ = std::fs::write(&options_file, lines.join("\n"));
    }
}

/// 启动 Minecraft 子进程并捕获日志，返回进程 PID
pub async fn spawn_minecraft(
    config: &LaunchConfig,
    state: &AppState,
    app_handle: &tauri::AppHandle,
) -> Result<u32, I18nError> {
    let total_steps: u32 = 7;
    let mut current_step: u32 = 0;

    let emit_progress = |app: &tauri::AppHandle, step: u32, label: &str| {
        let _ = app.emit(
            "launch-progress",
            crate::models::launch::LaunchProgress {
                step,
                total: total_steps,
                label: label.to_string(),
            },
        );
    };

    current_step += 1;
    emit_progress(app_handle, current_step, "launch.progress.checkFiles");

    // 启动前全量扫描版本文件：client、依赖库、资源对象、日志配置缺失或大小不对都会自动补全
    let download_source = read_download_source(&state.launcher_dir);
    crate::services::version::download::verify_and_repair_version(
        state,
        &config.version_id,
        &state.minecraft_dir,
        app_handle,
        &download_source,
        true,
        None,
    )
    .await
    .map_err(|e| i18n_err!("errors.launch.repairFilesFailed", e))?;

    current_step += 1;
    emit_progress(app_handle, current_step, "launch.progress.downloadFiles");

    current_step += 1;
    emit_progress(app_handle, current_step, "launch.progress.prepare");

    // 校验 Java 可执行文件是否存在
    if config.java_path != "java" && !Path::new(&config.java_path).exists() {
        return Err(i18n_err!("errors.launch.javaNotFound", &config.java_path));
    }

    current_step += 1;
    emit_progress(app_handle, current_step, "launch.progress.account");

    // 加载活跃账号
    let accounts_file = crate::utils::paths::get_accounts_file(&state.launcher_dir);
    let mut account = if accounts_file.exists() {
        let content = std::fs::read_to_string(&accounts_file)
            .map_err(|e| i18n_err!("errors.launch.readAccountsFailed", e))?;
        let accounts: Vec<crate::models::account::Account> = serde_json::from_str(&content)
            .unwrap_or_default();
        accounts.into_iter().find(|a| a.is_active)
            .ok_or(i18n_err!("errors.launch.noActiveAccount"))?
    } else {
        return Err(i18n_err!("errors.launch.noAccount"));
    };

    // 微软账号在启动前自动刷新即将过期的令牌
    crate::services::auth::microsoft::refresh_microsoft_account_if_needed(&mut account, state).await?;
    crate::commands::account::save_account(state, &account)?;

    current_step += 1;
    emit_progress(app_handle, current_step, "launch.progress.args");

    // 构建启动参数
    let args = crate::services::launch::config::build_launch_args(
        config,
        &state.minecraft_dir,
        &account,
    )?;

    // 把启动器语言同步进游戏设置，避免每次进入游戏都要手动选择语言
    let game_dir = match config.game_dir.as_deref() {
        Some(dir) => std::path::PathBuf::from(dir),
        None => state.minecraft_dir.clone(),
    };
    sync_game_language(&game_dir, &read_launcher_language(&state.launcher_dir));

    current_step += 1;
    emit_progress(app_handle, current_step, "launch.progress.jvm");

    // 打印启动命令（对 accessToken 脱敏，方便排查 Demo 模式等问题）
    let args_for_log: Vec<String> = {
        let mut redacted = Vec::with_capacity(args.len());
        let mut skip_next = false;
        for arg in args.iter() {
            if skip_next {
                redacted.push("***".to_string());
                skip_next = false;
                continue;
            }
            if arg == "--accessToken" || arg == "--uuid" {
                redacted.push(arg.clone());
                skip_next = true;
                continue;
            }
            // 对形如 -Dauth_access_token=xxx 的参数也脱敏
            if arg.starts_with("-Dauth_access_token=") || arg.starts_with("-Dauth_uuid=") {
                let key = arg.split('=').next().unwrap_or(arg);
                redacted.push(format!("{}=***", key));
                continue;
            }
            redacted.push(arg.clone());
        }
        redacted
    };
    info!("启动 Minecraft: {} {:?}", config.java_path, args_for_log);

    let mut cmd = Command::new(&config.java_path);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Windows 上隐藏 Java 的命令行窗口，避免弹出一个独立的 CMD 窗口
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd
        .spawn()
        .map_err(|e| i18n_err!("errors.launch.startProcessFailed", e))?;

    let child_id = child.id();
    let version_id_for_monitor = config.version_id.clone();
    let game_dir_for_monitor = game_dir.clone();
    let started_at_wall = SystemTime::now();

    // 捕获 stdout 日志
    let stdout = child.stdout.take().ok_or(i18n_err!("errors.launch.stdoutUnavailable"))?;
    let stderr = child.stderr.take().ok_or(i18n_err!("errors.launch.stderrUnavailable"))?;
    let app_handle_stdout = app_handle.clone();
    let app_handle_stderr = app_handle.clone();
    let app_handle_monitor = app_handle.clone();
    let state_for_monitor = state.clone();

    // 保留 stderr 的最后若干行：JVM 在日志文件初始化前就崩溃时，
    // 这是唯一能说明原因的输出。
    let stderr_buffer: std::sync::Arc<std::sync::Mutex<std::collections::VecDeque<String>>> =
        std::sync::Arc::new(std::sync::Mutex::new(std::collections::VecDeque::new()));
    let stderr_for_reader = stderr_buffer.clone();
    let stderr_for_monitor = stderr_buffer.clone();

    // 异步读取 stdout
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                let _ = app_handle_stdout.emit("launch-log", crate::models::launch::LogEntry {
                    level: "info".to_string(),
                    message: line,
                    timestamp: chrono::Utc::now().timestamp_millis(),
                });
            }
        }
    });

    // 异步读取 stderr
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                if let Ok(mut buffer) = stderr_for_reader.lock() {
                    if buffer.len() >= 200 {
                        buffer.pop_front();
                    }
                    buffer.push_back(line.clone());
                }
                let level = if line.contains("ERROR") || line.contains("FATAL") {
                    "error"
                } else if line.contains("WARN") {
                    "warn"
                } else {
                    "info"
                };
                let _ = app_handle_stderr.emit("launch-log", crate::models::launch::LogEntry {
                    level: level.to_string(),
                    message: line,
                    timestamp: chrono::Utc::now().timestamp_millis(),
                });
            }
        }
    });

    // 保存进程句柄，并监听进程退出以清理状态
    {
        let mut proc = state.active_process.lock().await;
        proc.insert(child_id, child);
    }

    // 统一监听任务：启动后持续观察进程是否存活。
    // 只有存活超过观察期（游戏已经过 JVM 初始化、窗口开始创建）才判定启动成功，
    // 期间一旦退出则立刻上报 launch-failed，避免“刚点启动就显示成功”。
    tokio::spawn(async move {
        const OBSERVE_WINDOW: std::time::Duration = std::time::Duration::from_secs(8);
        let started_at = std::time::Instant::now();

        let mut running_emitted = false;
        loop {
            let status = {
                let mut proc = state_for_monitor.active_process.lock().await;
                if let Some(child) = proc.get_mut(&child_id) {
                    child.try_wait().ok()
                } else {
                    // 已被 kill_minecraft 移除，无需再 emit 事件
                    None
                }
            };

            match status {
                None => {
                    // 句柄已被外部清理，直接结束监听
                    break;
                }
                Some(Some(exit_status)) => {
                    // 进程已退出：先判断是正常关游戏还是崩溃退出。
                    // 崩溃时要把 crash-reports / latest.log 里的原因带回前端弹窗，
                    // 否则用户只能看到窗口瞬间消失。
                    let stderr_tail: Vec<String> = stderr_for_monitor
                        .lock()
                        .map(|buffer| buffer.iter().cloned().collect())
                        .unwrap_or_default();
                    let crash = collect_crash_info(
                        &game_dir_for_monitor,
                        started_at_wall,
                        child_id,
                        version_id_for_monitor.clone(),
                        exit_status.code(),
                        &stderr_tail,
                    );

                    if running_emitted {
                        match crash {
                            Some(info) => {
                                info!(
                                    "Minecraft 崩溃退出 (pid={}): {}",
                                    child_id, info.summary
                                );
                                let _ = app_handle_monitor
                                    .emit("launch-instance-crashed", info);
                            }
                            None => {
                                let _ = app_handle_monitor.emit(
                                    "launch-instance-exited",
                                    crate::models::launch::LaunchInstance {
                                        pid: child_id,
                                        version_id: version_id_for_monitor.clone(),
                                    },
                                );
                            }
                        }
                    } else {
                        let _ = app_handle_monitor.emit(
                            "launch-failed",
                            crate::models::launch::LogEntry {
                                level: "error".to_string(),
                                message: "errors.launch.processExitedEarly".to_string(),
                                timestamp: chrono::Utc::now().timestamp_millis(),
                            },
                        );
                        // 启动阶段就崩溃时，同样把真实原因推给前端
                        if let Some(info) = crash {
                            let _ = app_handle_monitor
                                .emit("launch-instance-crashed", info);
                        }
                    }
                    {
                        let mut proc = state_for_monitor.active_process.lock().await;
                        proc.remove(&child_id);
                    }
                    info!("Minecraft 进程已退出 (pid={}): {}", child_id, exit_status);
                    break;
                }
                Some(None) => {
                    // 仍在运行
                    if !running_emitted {
                        if started_at.elapsed() < OBSERVE_WINDOW {
                            // 观察期内高频轮询，一旦进程退出可第一时间上报失败
                            tokio::time::sleep(std::time::Duration::from_millis(400)).await;
                            continue;
                        }
                        let _ = app_handle_monitor.emit(
                            "launch-progress",
                            crate::models::launch::LaunchProgress {
                                step: total_steps,
                                total: total_steps,
                                label: "launch.progress.running".to_string(),
                            },
                        );
                        let _ = app_handle_monitor.emit(
                            "launch-instance-running",
                            crate::models::launch::LaunchInstance {
                                pid: child_id,
                                version_id: version_id_for_monitor.clone(),
                            },
                        );
                        running_emitted = true;
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
            }
        }
    });

    info!("Minecraft 进程已启动 (pid={})", child_id);
    Ok(child_id)
}

/// 停止 Minecraft 子进程
/// - pid 为 None 时停止所有活跃进程
/// - pid 为 Some 时停止指定进程
pub async fn kill_minecraft(
    state: &AppState,
    pid: Option<u32>,
    app_handle: &tauri::AppHandle,
) -> Result<(), I18nError> {
    let mut proc = state.active_process.lock().await;
    match pid {
        Some(target_pid) => {
            if let Some(child) = proc.get_mut(&target_pid) {
                if let Err(e) = child.kill() {
                    log::warn!("停止进程 {} 失败: {}", target_pid, e);
                }
                proc.remove(&target_pid);
                let _ = app_handle.emit(
                    "launch-instance-exited",
                    crate::models::launch::LaunchInstance {
                        pid: target_pid,
                        version_id: String::new(),
                    },
                );
                info!("已停止 Minecraft 进程 (pid={})", target_pid);
                Ok(())
            } else {
                Err(i18n_err!("errors.launch.processNotFound", target_pid))
            }
        }
        None => {
            if proc.is_empty() {
                return Err(i18n_err!("errors.launch.noRunningProcess"));
            }
            let pids: Vec<u32> = proc.keys().copied().collect();
            for target_pid in pids {
                if let Some(child) = proc.get_mut(&target_pid) {
                    if let Err(e) = child.kill() {
                        log::warn!("停止进程 {} 失败: {}", target_pid, e);
                    }
                }
                let _ = app_handle.emit(
                    "launch-instance-exited",
                    crate::models::launch::LaunchInstance {
                        pid: target_pid,
                        version_id: String::new(),
                    },
                );
            }
            proc.clear();
            info!("已停止所有 Minecraft 进程");
            Ok(())
        }
    }
}

/// 汇总崩溃原因：优先读本次启动后生成的 crash-report / JVM 错误日志，
/// 其次读 latest.log 末尾。返回 None 表示看起来是正常关闭。
fn collect_crash_info(
    game_dir: &Path,
    started_at: SystemTime,
    pid: u32,
    version_id: String,
    exit_code: Option<i32>,
    stderr_tail: &[String],
) -> Option<CrashInfo> {
    let mut log_tail = read_log_tail(game_dir, 80);
    // 日志文件还没生成（JVM 早期崩溃）时，退回用 stderr 的输出
    if log_tail.is_empty() {
        log_tail = stderr_tail.to_vec();
    }

    if let Some((path, content)) = find_crash_report(game_dir, started_at)
        .or_else(|| find_jvm_error_log(game_dir, pid, started_at))
    {
        return Some(CrashInfo {
            pid,
            version_id,
            game_dir: game_dir.to_string_lossy().into_owned(),
            exit_code,
            summary: extract_crash_summary(&content),
            details: first_lines(&content, 120, 16_000),
            report_path: Some(path.to_string_lossy().into_owned()),
            log_tail,
        });
    }

    // 退出代码为 0 且没有新的崩溃报告：按用户正常关闭游戏处理
    if exit_code == Some(0) {
        return None;
    }

    let summary = {
        let from_log = summary_from_log(&log_tail);
        if from_log.is_empty() {
            summary_from_log(stderr_tail)
        } else {
            from_log
        }
    };

    Some(CrashInfo {
        pid,
        version_id,
        game_dir: game_dir.to_string_lossy().into_owned(),
        exit_code,
        summary,
        details: String::new(),
        report_path: None,
        log_tail,
    })
}

/// 找本次启动之后最新的 crash-report（crash-reports/crash-*.txt）
fn find_crash_report(game_dir: &Path, started_at: SystemTime) -> Option<(PathBuf, String)> {
    let dir = game_dir.join("crash-reports");
    let entries = std::fs::read_dir(&dir).ok()?;
    let since = started_at
        .checked_sub(Duration::from_secs(10))
        .unwrap_or(started_at);

    let mut newest: Option<(PathBuf, SystemTime)> = None;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if !name.starts_with("crash-") || !name.ends_with(".txt") {
            continue;
        }
        let Ok(modified) = entry.metadata().and_then(|m| m.modified()) else {
            continue;
        };
        if modified < since {
            continue;
        }
        if newest.as_ref().map(|(_, time)| modified > *time).unwrap_or(true) {
            newest = Some((path, modified));
        }
    }

    let (path, _) = newest?;
    let content = std::fs::read_to_string(&path).ok()?;
    Some((path, content))
}

/// JVM 直接崩溃时会在工作目录留下 hs_err_pid<pid>.log
fn find_jvm_error_log(game_dir: &Path, pid: u32, started_at: SystemTime) -> Option<(PathBuf, String)> {
    let path = game_dir.join(format!("hs_err_pid{}.log", pid));
    let modified = std::fs::metadata(&path).ok()?.modified().ok()?;
    let since = started_at
        .checked_sub(Duration::from_secs(10))
        .unwrap_or(started_at);
    if modified < since {
        return None;
    }
    let content = std::fs::read_to_string(&path).ok()?;
    Some((path, content))
}

/// 从崩溃报告里提取一句话原因
fn extract_crash_summary(content: &str) -> String {
    let mut lines = content.lines();
    while let Some(line) = lines.next() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("Description:") {
            let rest = rest.trim();
            if !rest.is_empty() {
                return truncate_text(rest, 300);
            }
            if let Some(next) = lines.next() {
                let next = next.trim();
                if !next.is_empty() {
                    return truncate_text(next, 300);
                }
            }
        }
    }

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.contains("EXCEPTION_")
            || trimmed.contains("SIGSEGV")
            || trimmed.contains("Internal Error")
            || trimmed.contains("Exception")
            || trimmed.contains("Error")
        {
            return truncate_text(trimmed, 300);
        }
    }
    String::new()
}

/// 从 latest.log 末尾找最后一条像异常的行
fn summary_from_log(log_tail: &[String]) -> String {
    for line in log_tail.iter().rev() {
        let trimmed = line.trim();
        if trimmed.starts_with("at ") || trimmed.starts_with("\tat ") {
            continue;
        }
        let lower = trimmed.to_lowercase();
        if lower.contains("exception")
            || lower.contains("error")
            || lower.contains("caused by")
            || lower.contains("fatal")
        {
            return truncate_text(trimmed, 300);
        }
    }
    String::new()
}

/// 读取 logs/latest.log 的最后若干行（只读文件尾部，避免大日志卡顿）
fn read_log_tail(game_dir: &Path, max_lines: usize) -> Vec<String> {
    let path = game_dir.join("logs").join("latest.log");
    let Ok(bytes) = std::fs::read(&path) else {
        return Vec::new();
    };
    const MAX_BYTES: usize = 256 * 1024;
    let slice = if bytes.len() > MAX_BYTES {
        &bytes[bytes.len() - MAX_BYTES..]
    } else {
        &bytes[..]
    };
    let text = String::from_utf8_lossy(slice);
    let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
    if lines.len() > max_lines {
        lines = lines.split_off(lines.len() - max_lines);
    }
    lines
}

fn first_lines(content: &str, max_lines: usize, max_chars: usize) -> String {
    let mut result = String::new();
    for line in content.lines().take(max_lines) {
        if result.len() + line.len() + 1 > max_chars {
            break;
        }
        result.push_str(line);
        result.push('\n');
    }
    result
}

fn truncate_text(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    text.chars().take(max_chars).collect::<String>() + "…"
}

/// 读取设置获取下载源
fn read_download_source(launcher_dir: &Path) -> DownloadSource {
    let settings_file = crate::utils::paths::get_settings_file(launcher_dir);
    if settings_file.exists() {
        std::fs::read_to_string(&settings_file)
            .ok()
            .and_then(|content| serde_json::from_str::<Settings>(&content).ok())
            .map(|s| s.download_source)
            .unwrap_or(DownloadSource::Official)
    } else {
        DownloadSource::Official
    }
}
