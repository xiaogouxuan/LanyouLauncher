// Deserialization-only fields are expected to be "dead code"
#![allow(dead_code)]

use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::account::{Account, AccountType};
use crate::models::launch::LaunchConfig;
use crate::services::auth::offline::generate_offline_uuid;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

/// Minecraft version.json 解析结构（精简版，仅启动所需字段）
#[derive(Debug, Deserialize)]
struct VersionJson {
    id: String,
    #[serde(rename = "mainClass")]
    main_class: String,
    #[serde(rename = "type")]
    version_type: Option<String>,
    arguments: Option<VersionArguments>,
    #[serde(rename = "minecraftArguments")]
    minecraft_arguments: Option<String>,
    libraries: Vec<VersionLibrary>,
    #[serde(rename = "assetIndex")]
    asset_index: AssetIndexRef,
    assets: Option<String>,
    #[serde(rename = "minimumLauncherVersion")]
    minimum_launcher_version: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct VersionArguments {
    jvm: Option<Vec<serde_json::Value>>,
    game: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct AssetIndexRef {
    id: String,
}

#[derive(Debug, Deserialize)]
struct VersionLibrary {
    name: String,
    downloads: Option<LibraryDownloads>,
    natives: Option<HashMap<String, String>>,
    extract: Option<ExtractRules>,
    rules: Option<Vec<LibraryRule>>,
}

#[derive(Debug, Deserialize)]
struct LibraryDownloads {
    artifact: Option<ArtifactInfo>,
    classifiers: Option<HashMap<String, ArtifactInfo>>,
}

#[derive(Debug, Deserialize)]
struct ArtifactInfo {
    path: Option<String>,
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ExtractRules {
    exclude: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct LibraryRule {
    action: String,
    os: Option<OsFilter>,
}

#[derive(Debug, Deserialize)]
struct OsFilter {
    name: Option<String>,
}

/// 构建 Minecraft 启动参数
pub fn build_launch_args(
    config: &LaunchConfig,
    minecraft_dir: &Path,
    account: &Account,
) -> Result<Vec<String>, I18nError> {
    // 1. 读取 version.json
    let versions_dir = crate::utils::paths::get_versions_dir(minecraft_dir);
    let version_json_path = versions_dir
        .join(&config.version_id)
        .join(format!("{}.json", config.version_id));

    let content = std::fs::read_to_string(&version_json_path)
        .map_err(|e| {
            I18nError::new("errors.launch.readVersionFileFailed")
                .param("path", version_json_path.display().to_string())
                .param("detail", e.to_string())
        })?;
    let version: VersionJson = serde_json::from_str(&content)
        .map_err(|e| i18n_err!("errors.launch.parseVersionFileFailed", e))?;

    // 2. 确定游戏目录并准备 natives 目录
    let game_dir = config
        .game_dir
        .as_deref()
        .map(|d| Path::new(d).to_path_buf())
        .unwrap_or_else(|| minecraft_dir.to_path_buf());

    let natives_dir = versions_dir
        .join(&config.version_id)
        .join("natives");
    // 清空并重建 natives 目录，避免旧文件或损坏文件干扰启动
    if natives_dir.exists() {
        std::fs::remove_dir_all(&natives_dir)
            .map_err(|e| i18n_err!("errors.launch.startProcessFailed", e))?;
    }
    std::fs::create_dir_all(&natives_dir)
        .map_err(|e| i18n_err!("errors.launch.startProcessFailed", e))?;

    // 3. 提取 native 库
    extract_natives(&version, minecraft_dir, &natives_dir)
        .map_err(|e| i18n_err!("errors.launch.startProcessFailed", e))?;

    // 4. 构建 classpath
    let classpath = build_classpath_string(&version, minecraft_dir, &config.version_id);

    let assets_dir = minecraft_dir.join("assets");
    let assets_index = version.asset_index.id.clone();

    // 5. 构建替换变量
    // Minecraft 要求 auth_uuid 为无横线的 32 位 UUID
    // 离线账号按 Java UUID.nameUUIDFromBytes 重新计算，兼容旧账号文件中的错误 UUID
    let auth_uuid = if account.account_type == AccountType::Offline {
        generate_offline_uuid(&account.username).replace('-', "").to_lowercase()
    } else {
        account.id.replace('-', "").to_lowercase()
    };
    // 离线账号使用随机 UUID（无横线）作为 accessToken，与 HMCL logInWithoutSkin 一致。
    let access_token = if account.account_type == AccountType::Offline {
        uuid::Uuid::new_v4().to_string().replace('-', "")
    } else {
        account.access_token.clone().unwrap_or_default()
    };
    // 客户端 jar 路径，部分旧版 Forge/OptiFine 需要 ${primary_jar}
    let primary_jar = versions_dir
        .join(&config.version_id)
        .join(format!("{}.jar", config.version_id));

    let replacements: Vec<(&str, String)> = vec![
        ("auth_player_name", account.username.clone()),
        ("auth_session", access_token.clone()),
        ("auth_access_token", access_token.clone()),
        ("auth_uuid", auth_uuid.clone()),
        ("user_type", "msa".to_string()),
        ("user_properties", "{}".to_string()),
        ("version_name", config.version_id.clone()),
        (
            "version_type",
            version
                .version_type
                .clone()
                .unwrap_or_else(|| "release".to_string()),
        ),
        (
            "profile_name",
            version
                .version_type
                .clone()
                .unwrap_or_else(|| "Minecraft".to_string()),
        ),
        ("game_directory", game_dir.to_string_lossy().to_string()),
        ("assets_root", assets_dir.to_string_lossy().to_string()),
        ("game_assets", assets_dir.to_string_lossy().to_string()),
        ("assets_index_name", assets_index),
        (
            "natives_directory",
            natives_dir.to_string_lossy().to_string(),
        ),
        ("classpath", classpath.clone()),
        ("primary_jar", primary_jar.to_string_lossy().to_string()),
        ("launcher_name", "LanyouLauncher".to_string()),
        ("launcher_version", env!("CARGO_PKG_VERSION").to_string()),
        (
            "classpath_separator",
            if cfg!(target_os = "windows") {
                ";"
            } else {
                ":"
            }
            .to_string(),
        ),
        (
            "library_directory",
            minecraft_dir.join("libraries").to_string_lossy().to_string(),
        ),
    ];

    // 6. 构建 JVM 参数
    let mut args: Vec<String> = Vec::new();

    // 获取实际 Java 主版本，避免把高版本参数传给不兼容的 JVM
    let java_major = get_java_major_version(&config.java_path);

    // 内存参数
    args.push(format!("-Xmx{}M", config.memory_max));
    args.push(format!("-Xms{}M", config.memory_min));
    // Metaspace 初始大小（Java 8+）；旧版 Java 使用 PermSize
    if java_major.unwrap_or(8) >= 8 {
        args.push("-XX:MetaspaceSize=128M".to_string());
    } else {
        args.push("-XX:PermSize=128M".to_string());
    }

    // 强制指定 native 库路径（兼容未在 version.json 中声明的情况）
    args.push(format!(
        "-Djava.library.path={}",
        natives_dir.to_string_lossy()
    ));

    // 编码与 I/O 行为优化（参考 HMCL DefaultLauncher）
    args.push("-Dfile.encoding=UTF-8".to_string());
    if java_major.map_or(true, |v| v < 19) {
        args.push("-Dsun.stdout.encoding=UTF-8".to_string());
        args.push("-Dsun.stderr.encoding=UTF-8".to_string());
    } else {
        args.push("-Dstdout.encoding=UTF-8".to_string());
        args.push("-Dstderr.encoding=UTF-8".to_string());
    }

    // Log4j / JNDI RCE 防护（HMCL 同款）
    args.push("-Dlog4j2.formatMsgNoLookups=true".to_string());
    args.push("-Djava.rmi.server.useCodebaseOnly=true".to_string());
    args.push("-Dcom.sun.jndi.rmi.object.trustURLCodebase=false".to_string());
    args.push("-Dcom.sun.jndi.cosnaming.object.trustURLCodebase=false".to_string());

    // G1GC 优化参数：仅在 Java 8 显式开启；Java 9+ 默认即为 G1，
    // 部分 JVM/发行版对重复或不适用的 G1 参数会抛出 "must be enabled via UnlockExperimentalVMOptions" 错误。
    if java_major == Some(8) {
        args.push("-XX:+UseG1GC".to_string());
        args.push("-XX:G1MixedGCCountTarget=5".to_string());
        args.push("-XX:G1NewSizePercent=20".to_string());
        args.push("-XX:G1ReservePercent=20".to_string());
        args.push("-XX:MaxGCPauseMillis=50".to_string());
        args.push("-XX:G1HeapRegionSize=32m".to_string());
    }

    // Forge 兼容性参数（HMCL 默认）
    args.push("-Dfml.ignoreInvalidMinecraftCertificates=true".to_string());
    args.push("-Dfml.ignorePatchDiscrepancies=true".to_string());

    // 指明客户端 jar 路径（HMCL 默认，部分旧版 Forge/OptiFine 依赖）
    args.push(format!("-Dminecraft.client.jar={}", primary_jar.to_string_lossy()));

    // 构建 features 映射，用于匹配 version.json 中的 feature 规则
    // 参考 HMCL DefaultLauncher.getFeatures() + CompatibilityRule
    // 关键：is_demo_user 必须为 false，否则 --demo 会被错误地添加到启动参数中
    let mut features: HashMap<String, bool> = HashMap::new();
    features.insert("is_demo_user".to_string(), false);
    features.insert(
        "has_custom_resolution".to_string(),
        config.resolution_width > 0 && config.resolution_height > 0,
    );

    // 处理 version.json 中的 JVM 参数
    if let Some(ref arguments) = version.arguments {
        if let Some(ref jvm_args) = arguments.jvm {
            args.extend(resolve_arguments(jvm_args, &replacements, &features));
        }
    }

    // 用户自定义 JVM 参数
    args.extend(config.jvm_args.clone());

    // classpath
    args.push("-cp".to_string());
    args.push(classpath);

    // main class
    args.push(version.main_class.clone());

    // 7. 构建游戏参数
    if let Some(ref arguments) = version.arguments {
        if let Some(ref game_args) = arguments.game {
            args.extend(resolve_arguments(game_args, &replacements, &features));
        }
    } else if let Some(ref minecraft_args) = version.minecraft_arguments {
        // 旧版格式：拆分空格分隔的参数字符串
        let resolved = replace_variables(minecraft_args, &replacements);
        args.extend(resolved.split(' ').map(String::from));
    }

    // 确保关键的账号/版本参数存在，避免某些核心缺失导致进入 Demo 模式
    let known_game_flags: std::collections::HashSet<String> = args
        .iter()
        .filter_map(|a| a.strip_prefix("--").map(String::from))
        .collect();

    if !known_game_flags.contains("username") {
        args.push("--username".to_string());
        args.push(account.username.clone());
    }
    if !known_game_flags.contains("uuid") {
        args.push("--uuid".to_string());
        args.push(auth_uuid.clone());
    }
    if !known_game_flags.contains("accessToken") {
        args.push("--accessToken".to_string());
        args.push(access_token.clone());
    }
    if !known_game_flags.contains("userType") {
        args.push("--userType".to_string());
        // HMCL 对微软账号和离线账号均使用 "msa"，避免部分服务器/核心将 mojang 视为无效而触发 Demo
        args.push("msa".to_string());
    }
    if !known_game_flags.contains("userProperties") {
        args.push("--userProperties".to_string());
        args.push("{}".to_string());
    }
    if !known_game_flags.contains("versionType") {
        args.push("--versionType".to_string());
        args.push(
            version
                .version_type
                .clone()
                .unwrap_or_else(|| "release".to_string()),
        );
    }

    // 分辨率参数
    args.push("--width".to_string());
    args.push(config.resolution_width.to_string());
    args.push("--height".to_string());
    args.push(config.resolution_height.to_string());

    Ok(args)
}

/// 解析参数数组，处理条件规则和变量替换
fn resolve_arguments(
    items: &[serde_json::Value],
    replacements: &[(&str, String)],
    features: &HashMap<String, bool>,
) -> Vec<String> {
    let mut result = Vec::new();

    for item in items {
        match item {
            // 普通字符串参数
            serde_json::Value::String(s) => {
                result.push(replace_variables(s, replacements));
            }
            // 带规则的对象参数
            serde_json::Value::Object(obj) => {
                // 检查 rules 条件
                if let Some(rules) = obj.get("rules") {
                    if !evaluate_rules(rules, features) {
                        continue;
                    }
                }

                // 获取 value（可以是字符串或数组）
                if let Some(value) = obj.get("value") {
                    match value {
                        serde_json::Value::String(s) => {
                            result.push(replace_variables(s, replacements));
                        }
                        serde_json::Value::Array(arr) => {
                            for v in arr {
                                if let Some(s) = v.as_str() {
                                    result.push(replace_variables(s, replacements));
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }

    result
}

/// 替换字符串中的 ${variable} 占位符
fn replace_variables(input: &str, replacements: &[(&str, String)]) -> String {
    let mut result = input.to_string();
    for (key, value) in replacements {
        result = result.replace(&format!("${{{}}}", key), value);
    }
    result
}

/// 评估 rules 规则数组，判断当前平台是否满足条件
/// 参考 HMCL CompatibilityRule.appliesToCurrentEnvironment：
/// - 无规则时默认允许
/// - 有规则时默认不允许，只有匹配的规则才会设置 action
/// - 最终结果为最后一条匹配规则的 action
/// - 同时检查 os 和 features 两个维度，任一不匹配则规则不适用
/// 这能正确处理 "-XstartOnFirstThread" 这类 "仅在 macOS 上 allow" 的参数，
/// 以及 "--demo" 这类 "仅在 is_demo_user=true 时 allow" 的参数
fn evaluate_rules(rules: &serde_json::Value, features: &HashMap<String, bool>) -> bool {
    let rules_array = match rules.as_array() {
        Some(arr) => arr,
        None => return true,
    };

    if rules_array.is_empty() {
        return true;
    }

    let current_os = std::env::consts::OS;
    let mut allowed = false;

    for rule in rules_array {
        let action = rule
            .get("action")
            .and_then(|a| a.as_str())
            .unwrap_or("allow");

        // 检查 OS 限制
        let os_match = rule
            .get("os")
            .and_then(|os| os.get("name"))
            .and_then(|n| n.as_str())
            .map(|name| match name {
                "windows" => current_os == "windows",
                "macos" | "osx" => current_os == "macos",
                "linux" => current_os == "linux",
                _ => true,
            })
            .unwrap_or(true);

        if !os_match {
            continue;
        }

        // 检查 features 限制（参考 HMCL CompatibilityRule.getAppliedAction）
        let features_match = rule
            .get("features")
            .and_then(|f| f.as_object())
            .map(|feat_map| {
                feat_map.iter().all(|(key, val)| {
                    let expected = val.as_bool().unwrap_or(false);
                    let actual = features.get(key).copied().unwrap_or(false);
                    actual == expected
                })
            })
            .unwrap_or(true);

        if !features_match {
            continue;
        }

        allowed = action == "allow";
    }

    allowed
}

/// 构建 classpath 字符串
fn build_classpath_string(
    version: &VersionJson,
    minecraft_dir: &Path,
    version_id: &str,
) -> String {
    let separator = if cfg!(target_os = "windows") {
        ";"
    } else {
        ":"
    };

    let mut classpath_parts: Vec<String> = Vec::new();
    let libraries_dir = minecraft_dir.join("libraries");
    let versions_dir = crate::utils::paths::get_versions_dir(minecraft_dir);

    // 收集所有 libraries
    for lib in &version.libraries {
        if !should_include_library(lib) {
            continue;
        }

        let lib_path = if let Some(path) = lib
            .downloads
            .as_ref()
            .and_then(|d| d.artifact.as_ref())
            .and_then(|a| a.path.as_deref())
        {
            path.to_string()
        } else {
            derive_library_path(&lib.name)
        };

        let full_path = libraries_dir.join(&lib_path);
        classpath_parts.push(full_path.to_string_lossy().to_string());
    }

    // 添加 client.jar
    let client_jar = versions_dir
        .join(version_id)
        .join(format!("{}.jar", version_id));
    classpath_parts.push(client_jar.to_string_lossy().to_string());

    classpath_parts.join(separator)
}

/// 从 Maven 坐标推导 library 路径
fn derive_library_path(name: &str) -> String {
    // com.mojang:logging:1.1.1 → com/mojang/logging/1.1.1/logging-1.1.1.jar
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() >= 3 {
        let (group, artifact, version) = (parts[0], parts[1], parts[2]);
        let group_path = group.replace('.', "/");
        format!(
            "{}/{}/{}/{}-{}.jar",
            group_path, artifact, version, artifact, version
        )
    } else {
        format!("{}.jar", name.replace(':', "/"))
    }
}

/// 判断是否应包含此 library
/// 规则语义与 evaluate_rules 一致：有规则时默认不允许，只有匹配的 allow 规则才允许
fn should_include_library(lib: &VersionLibrary) -> bool {
    let Some(rules) = &lib.rules else {
        return true;
    };

    if rules.is_empty() {
        return true;
    }

    let current_os = std::env::consts::OS;
    let mut allowed = false;

    for rule in rules {
        let applies = rule
            .os
            .as_ref()
            .and_then(|o| o.name.as_deref())
            .map(|name| match name {
                "windows" => current_os == "windows",
                "macos" | "osx" => current_os == "macos",
                "linux" => current_os == "linux",
                _ => true,
            })
            .unwrap_or(true);

        if applies {
            allowed = rule.action == "allow";
        }
    }

    allowed
}

/// 提取 native 库到 natives 目录
fn extract_natives(
    version: &VersionJson,
    minecraft_dir: &Path,
    natives_dir: &Path,
) -> Result<(), std::io::Error> {
    let libraries_dir = minecraft_dir.join("libraries");

    for lib in &version.libraries {
        if !should_include_library(lib) {
            continue;
        }

        let Some(classifier_key) = get_native_classifier(lib) else {
            continue;
        };

        let Some(artifact) = lib
            .downloads
            .as_ref()
            .and_then(|d| d.classifiers.as_ref())
            .and_then(|c| c.get(&classifier_key))
        else {
            continue;
        };

        let native_path = artifact
            .path
            .as_deref()
            .map(|p| p.to_string())
            .unwrap_or_else(|| {
                format!(
                    "{}-{}",
                    derive_library_path(&lib.name).replace(".jar", ""),
                    classifier_key
                )
            });
        let native_jar = libraries_dir.join(&native_path);

        if !native_jar.exists() {
            log::warn!("Native 库不存在，跳过提取: {}", native_jar.display());
            continue;
        }

        extract_jar(&native_jar, natives_dir, lib.extract.as_ref())?;
    }

    Ok(())
}

/// 根据当前平台返回 native classifier 键
fn get_native_classifier(lib: &VersionLibrary) -> Option<String> {
    let natives = lib.natives.as_ref()?;
    let current_os = std::env::consts::OS;
    let key = match current_os {
        "windows" => natives.get("windows"),
        "macos" => natives.get("osx").or_else(|| natives.get("macos")),
        "linux" => natives.get("linux"),
        _ => None,
    };
    key.cloned()
}

/// 解压 jar 文件，支持排除列表
fn extract_jar(
    jar_path: &Path,
    dest_dir: &Path,
    extract_rules: Option<&ExtractRules>,
) -> Result<(), std::io::Error> {
    let file = std::fs::File::open(jar_path)?;
    let reader = std::io::BufReader::new(file);
    let mut archive = zip::ZipArchive::new(reader)?;

    let excludes: Vec<&str> = extract_rules
        .and_then(|r| r.exclude.as_ref())
        .map(|v| v.iter().map(|s| s.as_str()).collect())
        .unwrap_or_default();

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let name = file.name();

        // 跳过目录和排除项
        if name.ends_with('/') {
            continue;
        }
        if excludes.iter().any(|ex| name.starts_with(ex)) {
            continue;
        }

        let out_path = dest_dir.join(name);
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let mut out_file = std::fs::File::create(&out_path)?;
        std::io::copy(&mut file, &mut out_file)?;
    }

    Ok(())
}

/// 获取指定 Java 可执行文件的主版本号。
/// 支持 PATH 中的 "java" 以及绝对路径的可执行文件。
fn get_java_major_version(java_path: &str) -> Option<u32> {
    let output = if java_path == "java" {
        std::process::Command::new("java").arg("-version").output().ok()?
    } else {
        std::process::Command::new(java_path).arg("-version").output().ok()?
    };

    let version_str = String::from_utf8_lossy(&output.stderr);
    for line in version_str.lines() {
        if let Some(start) = line.find('"') {
            let rest = &line[start + 1..];
            if let Some(end) = rest.find('"') {
                return parse_java_major_version(&rest[..end]);
            }
        }
    }
    None
}

/// 解析 Java 主版本号。
/// - "1.8.0_202" -> 8
/// - "11.0.1" -> 11
/// - "21.0.10" -> 21
fn parse_java_major_version(version: &str) -> Option<u32> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_library_path() {
        let path = derive_library_path("com.mojang:logging:1.1.1");
        assert_eq!(path, "com/mojang/logging/1.1.1/logging-1.1.1.jar");
    }

    #[test]
    fn test_replace_variables() {
        let input = "Hello ${name}, your token is ${token}";
        let replacements = vec![
            ("name", "Player".to_string()),
            ("token", "abc123".to_string()),
        ];
        let result = replace_variables(input, &replacements);
        assert_eq!(result, "Hello Player, your token is abc123");
    }

    #[test]
    fn test_parse_java_major_version() {
        assert_eq!(parse_java_major_version("1.8.0_202"), Some(8));
        assert_eq!(parse_java_major_version("11.0.1"), Some(11));
        assert_eq!(parse_java_major_version("17.0.5"), Some(17));
        assert_eq!(parse_java_major_version("21.0.10"), Some(21));
        assert_eq!(parse_java_major_version("8.0"), Some(8));
        assert_eq!(parse_java_major_version("1.7.0"), None);
    }
}
