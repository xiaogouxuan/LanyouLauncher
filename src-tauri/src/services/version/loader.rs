// Deserialization-only fields
#![allow(dead_code)]

use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::version::LoaderType;
use crate::state::app_state::AppState;
use serde::Deserialize;
use std::path::Path;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Debug, Deserialize)]
struct FabricLoaderVersion {
    loader: FabricLoaderInfo,
    intermediary: FabricMavenInfo,
}

#[derive(Debug, Deserialize)]
struct FabricLoaderInfo {
    version: String,
    maven: String,
}

#[derive(Debug, Deserialize)]
struct FabricMavenInfo {
    version: String,
    maven: String,
}

#[derive(Debug, Deserialize)]
struct QuiltLoaderVersion {
    loader: QuiltLoaderInfo,
    intermediary: QuiltMavenInfo,
    launcher_meta: QuiltLauncherMeta,
}

#[derive(Debug, Deserialize)]
struct QuiltLoaderInfo {
    version: String,
    maven: String,
}

#[derive(Debug, Deserialize)]
struct QuiltMavenInfo {
    version: String,
    maven: String,
}

#[derive(Debug, Deserialize)]
struct QuiltLauncherMeta {
    version: QuiltLauncherVersion,
}

#[derive(Debug, Deserialize)]
struct QuiltLauncherVersion {
    // quilt-loader 的 launcher 元数据，按需扩展
}

/// 安装 Mod 加载器
pub async fn install_loader(
    state: &AppState,
    version_id: &str,
    loader: &LoaderType,
    minecraft_dir: &Path,
) -> Result<(), I18nError> {
    match loader {
        LoaderType::Fabric => install_fabric(state, version_id, minecraft_dir).await,
        LoaderType::Forge => install_forge(state, version_id, minecraft_dir).await,
        LoaderType::NeoForge => install_neoforge(state, version_id, minecraft_dir).await,
        LoaderType::Quilt => install_quilt(state, version_id, minecraft_dir).await,
    }
}

/// 安装 Fabric 加载器
async fn install_fabric(
    state: &AppState,
    version_id: &str,
    minecraft_dir: &Path,
) -> Result<(), I18nError> {
    let meta_url = format!("https://meta.fabricmc.net/v2/versions/loader/{}", version_id);
    let response = state
        .http_client
        .get(&meta_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.version.fetchFabricMetaFailed", e))?;

    if !response.status().is_success() {
        return Err(i18n_err!("errors.version.fabricNotSupported", version_id));
    }

    let fabric_meta: Vec<FabricLoaderVersion> = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.version.parseFabricMetaFailed", e))?;

    let latest = fabric_meta
        .first()
        .ok_or(i18n_err!("errors.version.noFabricLoaderVersion"))?;

    let loader_version = &latest.loader.version;
    let intermediary_version = &latest.intermediary.version;

    // 下载 Fabric Loader jar
    let libraries_dir = minecraft_dir.join("libraries");
    let loader_jar_path = maven_to_path(&latest.loader.maven);
    let loader_dest = libraries_dir.join(&loader_jar_path);

    if let Some(parent) = loader_dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| i18n_err!("errors.version.createDirFailed", e))?;
    }

    let loader_url = format!("https://maven.fabricmc.net/{}", loader_jar_path);
    download_file(&state.http_client, &loader_url, &loader_dest).await?;

    // 下载 intermediary jar
    let intermediary_jar_path = maven_to_path(&format!(
        "net.fabricmc:intermediary:{}",
        intermediary_version
    ));
    let intermediary_dest = libraries_dir.join(&intermediary_jar_path);
    if let Some(parent) = intermediary_dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| i18n_err!("errors.version.createDirFailed", e))?;
    }
    let intermediary_url = format!("https://maven.fabricmc.net/{}", intermediary_jar_path);
    download_file(&state.http_client, &intermediary_url, &intermediary_dest).await?;

    // 创建 Fabric 版本 JSON（继承原版）
    let versions_dir = crate::utils::paths::get_versions_dir(minecraft_dir);
    let fabric_version_id = format!("fabric-loader-{}-{}", loader_version, version_id);
    let fabric_version_dir = versions_dir.join(&fabric_version_id);
    std::fs::create_dir_all(&fabric_version_dir)
        .map_err(|e| i18n_err!("errors.version.createVersionDirFailed", e))?;

    let fabric_json = serde_json::json!({
        "id": fabric_version_id,
        "inheritsFrom": version_id,
        "type": "release",
        "mainClass": "net.fabricmc.loader.impl.launch.knot.KnotClient",
        "arguments": {
            "game": []
        },
        "libraries": [
            {
                "name": latest.loader.maven,
                "url": "https://maven.fabricmc.net/"
            },
            {
                "name": format!("net.fabricmc:intermediary:{}", intermediary_version),
                "url": "https://maven.fabricmc.net/"
            }
        ]
    });

    let json_path = fabric_version_dir.join(format!("{}.json", fabric_version_id));
    let json_content = serde_json::to_string_pretty(&fabric_json)
        .map_err(|e| i18n_err!("errors.version.serializeVersionJsonFailed", e))?;
    std::fs::write(&json_path, json_content)
        .map_err(|e| i18n_err!("errors.version.writeVersionJsonFailed", e))?;

    Ok(())
}

/// 安装 Quilt 加载器（逻辑与 Fabric 类似）
async fn install_quilt(
    state: &AppState,
    version_id: &str,
    minecraft_dir: &Path,
) -> Result<(), I18nError> {
    let meta_url = format!("https://meta.quiltmc.org/v3/versions/loader/{}", version_id);
    let response = state
        .http_client
        .get(&meta_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.version.fetchQuiltMetaFailed", e))?;

    if !response.status().is_success() {
        return Err(i18n_err!("errors.version.quiltNotSupported", version_id));
    }

    let quilt_meta: Vec<QuiltLoaderVersion> = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.version.parseQuiltMetaFailed", e))?;

    let latest = quilt_meta
        .first()
        .ok_or(i18n_err!("errors.version.noQuiltLoaderVersion"))?;

    let loader_version = &latest.loader.version;
    let intermediary_version = &latest.intermediary.version;

    let libraries_dir = minecraft_dir.join("libraries");
    let loader_jar_path = maven_to_path(&latest.loader.maven);
    let loader_dest = libraries_dir.join(&loader_jar_path);
    if let Some(parent) = loader_dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| i18n_err!("errors.version.createDirFailed", e))?;
    }
    let loader_url = format!("https://maven.quiltmc.org/repository/release/{}", loader_jar_path);
    download_file(&state.http_client, &loader_url, &loader_dest).await?;

    let intermediary_jar_path = maven_to_path(&format!(
        "org.quiltmc:quilt-intermediary:{}",
        intermediary_version
    ));
    let intermediary_dest = libraries_dir.join(&intermediary_jar_path);
    if let Some(parent) = intermediary_dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| i18n_err!("errors.version.createDirFailed", e))?;
    }
    let intermediary_url = format!(
        "https://maven.quiltmc.org/repository/release/{}",
        intermediary_jar_path
    );
    download_file(&state.http_client, &intermediary_url, &intermediary_dest).await?;

    let versions_dir = crate::utils::paths::get_versions_dir(minecraft_dir);
    let quilt_version_id = format!("quilt-loader-{}-{}", loader_version, version_id);
    let quilt_version_dir = versions_dir.join(&quilt_version_id);
    std::fs::create_dir_all(&quilt_version_dir)
        .map_err(|e| i18n_err!("errors.version.createVersionDirFailed", e))?;

    let quilt_json = serde_json::json!({
        "id": quilt_version_id,
        "inheritsFrom": version_id,
        "type": "release",
        "mainClass": "org.quiltmc.loader.impl.launch.knot.KnotClient",
        "arguments": {
            "game": []
        },
        "libraries": [
            {
                "name": latest.loader.maven,
                "url": "https://maven.quiltmc.org/repository/release/"
            },
            {
                "name": format!("org.quiltmc:quilt-intermediary:{}", intermediary_version),
                "url": "https://maven.quiltmc.org/repository/release/"
            }
        ]
    });

    let json_path = quilt_version_dir.join(format!("{}.json", quilt_version_id));
    let json_content = serde_json::to_string_pretty(&quilt_json)
        .map_err(|e| i18n_err!("errors.version.serializeVersionJsonFailed", e))?;
    std::fs::write(&json_path, json_content)
        .map_err(|e| i18n_err!("errors.version.writeVersionJsonFailed", e))?;

    Ok(())
}

/// 安装 Forge 加载器
/// 通过下载 Forge installer 并以无窗口方式运行 --installClient 完成安装
async fn install_forge(
    state: &AppState,
    version_id: &str,
    minecraft_dir: &Path,
) -> Result<(), I18nError> {
    // 获取 Forge 版本列表
    let forge_manifest_url = format!(
        "https://files.minecraftforge.net/net/minecraftforge/forge/index_{}.json",
        version_id
    );
    let response = state
        .http_client
        .get(&forge_manifest_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.version.fetchForgeManifestFailed", e))?;

    if !response.status().is_success() {
        return Err(i18n_err!("errors.version.forgeNotSupported", version_id));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.version.readForgeResponseFailed", e))?;

    // index_<mc>.json 结构：{ "homepage": ..., "promos": { "<mc>-recommended": "forge_version", ... } }
    let promos = body
        .get("promos")
        .and_then(|p| p.as_object())
        .ok_or(i18n_err!("errors.version.parseForgeManifestFailed"))?;

    let recommended_key = format!("{}-recommended", version_id);
    let latest_key = format!("{}-latest", version_id);
    let forge_version = promos
        .get(&recommended_key)
        .or_else(|| promos.get(&latest_key))
        .and_then(|v| v.as_str())
        .ok_or(i18n_err!("errors.version.noForgeVersion", version_id))?;

    // Forge 版本号可能是 "41.1.0"，需要拼接成完整 installer 坐标
    let forge_full_version = if forge_version.contains(version_id) {
        forge_version.to_string()
    } else {
        format!("{}-{}", version_id, forge_version)
    };

    let installer_url = format!(
        "https://maven.minecraftforge.net/net/minecraftforge/forge/{}/forge-{}-installer.jar",
        forge_full_version, forge_full_version
    );

    let installer_path = minecraft_dir.join("cache").join(format!(
        "forge-{}-installer.jar",
        forge_full_version
    ));
    if let Some(parent) = installer_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| i18n_err!("errors.version.createDirFailed", e))?;
    }

    download_file(&state.http_client, &installer_url, &installer_path).await?;

    // 运行 installer
    run_installer_jar(&installer_path, minecraft_dir).await?;

    Ok(())
}

/// 安装 NeoForge 加载器
/// 通过 maven-metadata.xml 获取适合该 MC 版本的最新 NeoForge 版本号，再下载 installer 运行
async fn install_neoforge(
    state: &AppState,
    version_id: &str,
    minecraft_dir: &Path,
) -> Result<(), I18nError> {
    let metadata_url =
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
    let response = state
        .http_client
        .get(metadata_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.version.fetchNeoforgeMetaFailed", e))?;

    if !response.status().is_success() {
        return Err(i18n_err!("errors.version.neoforgeNotSupported", version_id));
    }

    let metadata_text = response
        .text()
        .await
        .map_err(|e| i18n_err!("errors.version.readNeoforgeMetaFailed", e))?;

    let neo_version = parse_latest_neoforge_version(&metadata_text, version_id)
        .ok_or(i18n_err!("errors.version.noNeoforgeVersion", version_id))?;

    let installer_url = format!(
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/{}/neoforge-{}-installer.jar",
        neo_version, neo_version
    );

    let installer_path = minecraft_dir
        .join("cache")
        .join(format!("neoforge-{}-installer.jar", neo_version));
    if let Some(parent) = installer_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| i18n_err!("errors.version.createDirFailed", e))?;
    }

    download_file(&state.http_client, &installer_url, &installer_path).await?;
    run_installer_jar(&installer_path, minecraft_dir).await?;

    Ok(())
}

/// 从 maven-metadata.xml 中找出匹配 Minecraft 主版本号的最新 NeoForge 版本
/// 例如 MC 1.20.1 对应 NeoForge 版本形如 47.x.x（NeoForge 大版本号对应 MC 版本）
fn parse_latest_neoforge_version(metadata: &str, version_id: &str) -> Option<String> {
    // 解析 MC 版本号的主次版本，如 1.20.1 -> (1, 20, 1)
    let parts: Vec<&str> = version_id.split('.').collect();
    if parts.len() < 2 {
        return None;
    }

    // NeoForge 大版本号对应关系：1.20.1 -> 47, 1.21 -> 21, ...
    // 这里通过前缀匹配：1.20.1 对应 47.x；1.21.x 对应 21.x
    let major_prefix = match (parts[0], parts[1]) {
        ("1", "20") if parts.get(2) == Some(&"1") => "47.",
        ("1", "20") if parts.get(2) == Some(&"2") => "48.",
        ("1", "20") if parts.get(2) == Some(&"3") => "49.",
        ("1", "20") if parts.get(2) == Some(&"4") => "50.",
        ("1", "20") if parts.get(2) == Some(&"5") => "51.",
        ("1", "20") if parts.get(2) == Some(&"6") => "52.",
        ("1", "21") => "21.",
        _ => return None,
    };

    // 用简单字符串解析提取 <version>.*</version>
    let mut latest: Option<String> = None;
    for line in metadata.lines() {
        let trimmed = line.trim();
        if let Some(start) = trimmed.find("<version>") {
            if let Some(end) = trimmed.find("</version>") {
                let version = &trimmed[start + 9..end];
                if version.starts_with(major_prefix) {
                    if latest.as_ref().map(|l| version > l.as_str()).unwrap_or(true) {
                        latest = Some(version.to_string());
                    }
                }
            }
        }
    }

    latest
}

/// 运行 installer jar，安装加载器到指定 minecraft 目录
async fn run_installer_jar(
    installer_path: &std::path::Path,
    minecraft_dir: &Path,
) -> Result<(), I18nError> {
    let java = "java";
    let mut cmd = std::process::Command::new(java);
    cmd.arg("-jar")
        .arg(installer_path)
        .arg("--installClient")
        .arg(minecraft_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .output()
        .map_err(|e| i18n_err!("errors.version.runInstallerFailed", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(i18n_err!("errors.version.installerFailed", stderr.to_string()));
    }

    Ok(())
}

/// 下载文件
async fn download_file(
    client: &reqwest::Client,
    url: &str,
    dest: &std::path::PathBuf,
) -> Result<(), I18nError> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| {
            I18nError::new("errors.version.downloadFailed")
                .param("url", url)
                .param("detail", e.to_string())
        })?;

    if !response.status().is_success() {
        return Err(
            I18nError::new("errors.version.downloadHttpFailed")
                .param("url", url)
                .param("status", response.status().to_string()),
        );
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| {
            I18nError::new("errors.version.readResponseFailed")
                .param("url", url)
                .param("detail", e.to_string())
        })?;

    std::fs::write(dest, &bytes)
        .map_err(|e| {
            I18nError::new("errors.version.writeFileFailed")
                .param("path", dest.display().to_string())
                .param("detail", e.to_string())
        })?;

    Ok(())
}

/// 将 Maven 坐标转换为文件路径
fn maven_to_path(maven: &str) -> String {
    let parts: Vec<&str> = maven.split(':').collect();
    if parts.len() >= 3 {
        let group = parts[0].replace('.', "/");
        let artifact = parts[1];
        let version = parts[2];
        format!("{}/{}/{}/{}-{}.jar", group, artifact, version, artifact, version)
    } else {
        format!("{}.jar", maven.replace(':', "/"))
    }
}
