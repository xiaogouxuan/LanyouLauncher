use crate::i18n::I18nError;
use crate::i18n_err;
use std::ffi::OsStr;
use std::path::PathBuf;
use std::process::Command;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 构造 Java 命令，Windows 下隐藏控制台窗口
fn java_command<S: AsRef<OsStr>>(path: S) -> Command {
    let mut cmd = Command::new(path);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// 自动检测系统中安装的 Java 运行时
/// 扫描常见安装路径，验证 java 可执行文件，返回路径列表（仅路径，不含版本信息）
pub fn detect_java_runtimes() -> Vec<String> {
    let mut java_paths = Vec::new();

    // 1. 检查系统 PATH 中的 java
    if let Ok(output) = java_command("java").arg("-version").output() {
        if output.status.success() {
            java_paths.push("java".to_string());
        }
    }

    // 2. 扫描常见安装目录
    let search_dirs = get_java_search_dirs();

    for dir in &search_dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let java_exe = find_java_executable(&path);
                    if let Some(exe) = java_exe {
                        if get_java_version(&exe).is_ok() {
                            let exe_str = exe.to_string_lossy().to_string();
                            if !java_paths.contains(&exe_str) {
                                java_paths.push(exe_str);
                            }
                        }
                    }
                }
            }
        }
    }

    java_paths
}

/// 检测 Java 运行时并附带版本信息，用于设置页面展示
pub fn detect_java_runtimes_with_version() -> Vec<(String, String)> {
    let mut results = Vec::new();

    for path in detect_java_runtimes() {
        let version = if path == "java" {
            get_java_version_from_command("java").unwrap_or_default()
        } else {
            get_java_version(&PathBuf::from(&path)).unwrap_or_default()
        };
        results.push((path, version));
    }

    results
}

/// 通过命令获取 Java 版本（用于 PATH 中的 java）
fn get_java_version_from_command(java_cmd: &str) -> Result<String, I18nError> {
    let output = java_command(java_cmd)
        .arg("-version")
        .output()
        .map_err(|e| i18n_err!("errors.java.executeFailed", e))?;
    parse_java_version_output(&output.stderr)
}

/// 获取各平台 Java 搜索目录
fn get_java_search_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if cfg!(target_os = "windows") {
        // Windows 常见路径
        dirs.push(PathBuf::from("C:\\Program Files\\Java"));
        dirs.push(PathBuf::from("C:\\Program Files (x86)\\Java"));
        dirs.push(PathBuf::from("C:\\Program Files\\Eclipse Adoptium"));
        dirs.push(PathBuf::from("C:\\Program Files\\Eclipse Foundation"));
        dirs.push(PathBuf::from("C:\\Program Files\\Microsoft"));
        // 检查用户目录
        if let Ok(home) = std::env::var("USERPROFILE") {
            dirs.push(PathBuf::from(home.clone()).join(".jdks"));
            dirs.push(PathBuf::from(home).join("scoop\\apps"));
        }
    } else if cfg!(target_os = "macos") {
        dirs.push(PathBuf::from("/Library/Java/JavaVirtualMachines"));
        dirs.push(PathBuf::from("/usr/local/opt/openjdk"));
        if let Ok(home) = std::env::var("HOME") {
            dirs.push(PathBuf::from(&home).join(".sdkman/candidates/java"));
            dirs.push(PathBuf::from(&home).join("Library/Java/JavaVirtualMachines"));
        }
    } else {
        // Linux 常见路径
        dirs.push(PathBuf::from("/usr/lib/jvm"));
        dirs.push(PathBuf::from("/usr/lib64/jvm"));
        dirs.push(PathBuf::from("/usr/local/lib/jvm"));
        if let Ok(home) = std::env::var("HOME") {
            dirs.push(PathBuf::from(&home).join(".sdkman/candidates/java"));
        }
    }

    dirs
}

/// 在目录中查找 java 可执行文件
fn find_java_executable(dir: &PathBuf) -> Option<PathBuf> {
    let java_name = if cfg!(target_os = "windows") {
        "javaw.exe"
    } else {
        "java"
    };

    // 直接查找 bin/java
    let bin_java = dir.join("bin").join(java_name);
    if bin_java.exists() {
        return Some(bin_java);
    }

    // 递归查找（最多两层）
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let inner = path.join("bin").join(java_name);
            if inner.exists() {
                return Some(inner);
            }
        }
    }

    None
}

/// 获取 Java 版本号
fn get_java_version(java_path: &PathBuf) -> Result<String, I18nError> {
    let output = java_command(java_path)
        .arg("-version")
        .output()
        .map_err(|e| i18n_err!("errors.java.executeFailed", e))?;

    parse_java_version_output(&output.stderr)
}

/// 从 Java -version 输出中解析版本号
fn parse_java_version_output(output: &[u8]) -> Result<String, I18nError> {
    let version_str = String::from_utf8_lossy(output);
    // 提取版本号（如 "1.8.0_202", "17.0.1" 等）
    for line in version_str.lines() {
        if let Some(start) = line.find('"') {
            let rest = &line[start + 1..];
            if let Some(end) = rest.find('"') {
                return Ok(rest[..end].to_string());
            }
        }
    }

    Ok("settings.unknownJavaVersion".to_string())
}

/// 解析 Java 主版本号。
/// - "1.8.0_202" -> 8
/// - "11.0.1" -> 11
/// - "17.0.5" -> 17
/// - "21.0.1" -> 21
pub fn parse_java_major_version(version: &str) -> Option<u32> {
    let trimmed = version.trim();
    if trimmed.starts_with("1.8") || trimmed.starts_with("8.") {
        return Some(8);
    }
    trimmed
        .split('.')
        .next()
        .and_then(|s| s.parse::<u32>().ok())
        .filter(|&v| v >= 8)
}

/// 根据 Minecraft 版本 ID 推断推荐的 Java 主版本号。
/// 参考 HMCL 的 DefaultLauncher 与 GameJavaVersion 规则：
/// - < 1.16：Java 8
/// - 1.16 ~ 1.17.x：Java 8 或 11/16
/// - 1.18 ~ 1.20.4：Java 17
/// - >= 1.20.5：Java 21
fn infer_required_java_major(version_id: &str) -> u32 {
    // 提取版本号中的数字部分，例如 "1.20.1", "1.21", "25w14a"
    let normalized = version_id
        .replace("-pre", ".")
        .replace("-rc", ".")
        .replace("_", ".");
    let parts: Vec<&str> = normalized.split('.').collect();

    if let (Some(major_str), Some(minor_str)) = (parts.get(0), parts.get(1)) {
        if let (Ok(major), Ok(minor)) = (major_str.parse::<u32>(), minor_str.parse::<u32>()) {
            if major == 1 {
                if minor >= 21 {
                    return 21;
                }
                if minor == 20 {
                    // 1.20.5+ 需要 Java 21
                    if parts.get(2).and_then(|s| s.parse::<u32>().ok()).unwrap_or(0) >= 5 {
                        return 21;
                    }
                    return 17;
                }
                if minor >= 18 {
                    return 17;
                }
                if minor >= 16 {
                    return 11;
                }
            }
        }
    }

    8
}

/// 从 version.json 中读取 javaVersion.majorVersion（Minecraft 1.13+ 开始存在）
fn read_java_version_from_json(version_json: &str) -> Option<u32> {
    let json: serde_json::Value = serde_json::from_str(version_json).ok()?;
    json.get("javaVersion")
        .and_then(|jv| jv.get("majorVersion"))
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
}

/// 计算某个 Java 候选与目标版本的匹配分数，分数越低越合适。
/// - 完全匹配目标版本：-10
/// - 比目标高一个主版本：+1
/// - 比目标低：+10 * 差距
/// - 未知版本：+1000
fn java_match_score(major: Option<u32>, required: u32) -> u32 {
    match major {
        Some(m) if m == required => 0,
        Some(m) if m > required => m - required,
        Some(m) => (required - m) * 10,
        None => 1000,
    }
}

/// 为指定 Minecraft 版本选择最合适的 Java 运行时。
/// 优先读取 version.json 中的 javaVersion.majorVersion，否则按版本 ID 推断。
/// 返回选中的路径与版本号；若 java_paths 为空，返回 "java"。
pub fn select_java_for_version(
    version_id: &str,
    minecraft_dir: &std::path::Path,
    java_paths: &[String],
) -> (String, String) {
    // 读取 version.json 中的精确要求
    let versions_dir = crate::utils::paths::get_versions_dir(minecraft_dir);
    let version_json_path = versions_dir.join(version_id).join(format!("{}.json", version_id));
    let required = std::fs::read_to_string(&version_json_path)
        .ok()
        .and_then(|content| read_java_version_from_json(&content))
        .unwrap_or_else(|| infer_required_java_major(version_id));

    if java_paths.is_empty() {
        return ("java".to_string(), format!("Java {}", required));
    }

    // 收集所有候选的版本号
    let candidates: Vec<(String, Option<u32>, String)> = java_paths
        .iter()
        .map(|path| {
            let version = if path == "java" {
                get_java_version_from_command("java").unwrap_or_default()
            } else {
                get_java_version(&std::path::PathBuf::from(path)).unwrap_or_default()
            };
            let major = parse_java_major_version(&version);
            (path.clone(), major, version)
        })
        .collect();

    let best = candidates
        .iter()
        .min_by_key(|(_, major, _)| java_match_score(*major, required))
        .cloned()
        .unwrap_or_else(|| (java_paths[0].clone(), None, String::new()));

    (best.0, best.2)
}