// Deserialization-only fields are expected to be "dead code"
#![allow(dead_code)]

use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::settings::DownloadSource;
use crate::state::app_state::AppState;
use serde::Deserialize;
use std::path::Path;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Semaphore;

/// Minecraft version.json 完整结构
#[derive(Debug, Deserialize)]
struct VersionJson {
    id: String,
    #[serde(rename = "mainClass")]
    main_class: String,
    arguments: Option<Arguments>,
    #[serde(rename = "minecraftArguments")]
    minecraft_arguments: Option<String>,
    libraries: Vec<Library>,
    downloads: Downloads,
    #[serde(rename = "assetIndex")]
    asset_index: AssetIndexInfo,
    assets: Option<String>,
    logging: Option<LoggingConfig>,
}

#[derive(Debug, Deserialize)]
struct Arguments {
    jvm: Option<Vec<serde_json::Value>>,
    game: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct Downloads {
    client: DownloadArtifact,
}

#[derive(Debug, Deserialize)]
struct AssetIndexInfo {
    id: String,
    sha1: String,
    size: u64,
    url: String,
}

#[derive(Debug, Deserialize)]
struct Library {
    name: String,
    downloads: Option<LibraryDownloads>,
    rules: Option<Vec<Rule>>,
    natives: Option<std::collections::HashMap<String, String>>,
    extract: Option<ExtractRules>,
}

#[derive(Debug, Deserialize)]
struct ExtractRules {
    exclude: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct LibraryDownloads {
    artifact: Option<DownloadArtifact>,
    classifiers: Option<std::collections::HashMap<String, DownloadArtifact>>,
}

#[derive(Debug, Deserialize, Clone)]
struct DownloadArtifact {
    path: Option<String>,
    sha1: String,
    size: u64,
    url: String,
}

#[derive(Debug, Deserialize)]
struct Rule {
    action: String,
    os: Option<OsRule>,
}

#[derive(Debug, Deserialize)]
struct OsRule {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LoggingConfig {
    client: LoggingClient,
}

#[derive(Debug, Deserialize)]
struct LoggingClient {
    file: LoggingFile,
}

#[derive(Debug, Deserialize)]
struct LoggingFile {
    id: String,
    sha1: String,
    size: u64,
    url: String,
}

#[derive(Debug, Deserialize)]
struct AssetIndex {
    objects: std::collections::HashMap<String, AssetObject>,
}

#[derive(Debug, Deserialize)]
struct AssetObject {
    hash: String,
    size: u64,
}

/// 下载 Minecraft 版本文件
pub async fn download_version(
    state: &AppState,
    version_id: &str,
    minecraft_dir: &Path,
    app_handle: &tauri::AppHandle,
    download_source: &DownloadSource,
) -> Result<(), I18nError> {
    let versions_dir = crate::utils::paths::get_versions_dir(minecraft_dir);
    let version_dir = versions_dir.join(version_id);
    std::fs::create_dir_all(&version_dir)
        .map_err(|e| i18n_err!("errors.version.createVersionDirFailed", e))?;

    // 1. 获取版本清单，找到版本 JSON URL
    let manifest = crate::services::version::manifest::fetch_manifest(state, download_source).await?;
    let manifest_entry = manifest
        .versions
        .iter()
        .find(|v| v.id == version_id)
        .ok_or(i18n_err!("errors.version.versionNotInManifest", version_id))?;

    let total_steps: u64 = 5; // version.json + client.jar + libraries + assets + logging
    let mut current_step: u64 = 0;

    let emit_progress = |app: &tauri::AppHandle, step: u64, total: u64, status: &str| {
        let _ = app.emit(
            "download-progress",
            crate::models::version::DownloadProgress {
                id: version_id.to_string(),
                task_type: "version_download".to_string(),
                total,
                current: step,
                status: status.to_string(),
            },
        );
    };

    // 2. 下载 version.json
    emit_progress(app_handle, current_step, total_steps, "version.downloadingMetadata");
    let version_json_url = crate::utils::url::resolve_download_url(&manifest_entry.url, download_source);
    let version_json_path = version_dir.join(format!("{}.json", version_id));
    download_file(&state.http_client, &version_json_url, &version_json_path).await?;
    current_step += 1;

    // 3. 解析 version.json
    let version_content = std::fs::read_to_string(&version_json_path)
        .map_err(|e| i18n_err!("errors.version.readVersionJsonFailed", e))?;
    let version: VersionJson = serde_json::from_str(&version_content)
        .map_err(|e| i18n_err!("errors.version.parseVersionJsonFailed", e))?;

    // 4. 下载 client.jar
    emit_progress(
        app_handle,
        current_step,
        total_steps,
        "version.downloadingClient",
    );
    let client_url = crate::utils::url::resolve_download_url(&version.downloads.client.url, download_source);
    let client_jar_path = version_dir.join(format!("{}.jar", version_id));
    download_file(&state.http_client, &client_url, &client_jar_path).await?;
    current_step += 1;

    // 5. 下载 asset index
    let assets_indexes_dir = minecraft_dir.join("assets").join("indexes");
    std::fs::create_dir_all(&assets_indexes_dir)
        .map_err(|e| i18n_err!("errors.version.createAssetsDirFailed", e))?;
    let asset_index_url = crate::utils::url::resolve_download_url(&version.asset_index.url, download_source);
    let asset_index_path = assets_indexes_dir.join(format!("{}.json", version.asset_index.id));
    download_file(&state.http_client, &asset_index_url, &asset_index_path).await?;

    // 6. 下载 libraries
    emit_progress(app_handle, current_step, total_steps, "version.downloadingLibraries");
    let libraries_dir = minecraft_dir.join("libraries");
    std::fs::create_dir_all(&libraries_dir)
        .map_err(|e| i18n_err!("errors.version.createLibrariesDirFailed", e))?;

    for lib in &version.libraries {
        if !should_download_library(lib) {
            continue;
        }

        // 下载普通 artifact
        if let Some(artifact) = lib
            .downloads
            .as_ref()
            .and_then(|d| d.artifact.as_ref())
        {
            let lib_path = artifact
                .path
                .as_deref()
                .map(|p| p.to_string())
                .unwrap_or_else(|| derive_library_path(&lib.name));
            let dest = libraries_dir.join(&lib_path);
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            if !dest.exists() {
                let lib_url = crate::utils::url::resolve_download_url(&artifact.url, download_source);
                download_file(&state.http_client, &lib_url, &dest).await?;
            }
        }

        // 下载当前平台对应的 native classifier
        if let Some(classifier_key) = get_native_classifier(lib) {
            if let Some(artifact) = lib
                .downloads
                .as_ref()
                .and_then(|d| d.classifiers.as_ref())
                .and_then(|c| c.get(&classifier_key))
            {
                let native_path = artifact
                    .path
                    .as_deref()
                    .map(|p| p.to_string())
                    .unwrap_or_else(|| {
                        // org.lwjgl:lwjgl:3.3.2:natives-windows → org/lwjgl/lwjgl/3.3.2/lwjgl-3.3.2-natives-windows.jar
                        format!("{}-{}", derive_library_path(&lib.name).replace(".jar", ""), classifier_key)
                    });
                let dest = libraries_dir.join(&native_path);
                if let Some(parent) = dest.parent() {
                    std::fs::create_dir_all(parent).ok();
                }
                if !dest.exists() {
                    let native_url = crate::utils::url::resolve_download_url(&artifact.url, download_source);
                    download_file(&state.http_client, &native_url, &dest).await?;
                }
            }
        }
    }
    current_step += 1;

    // 7. 下载资源文件
    emit_progress(app_handle, current_step, total_steps, "version.downloadingAssets");
    download_assets(
        &state.http_client,
        minecraft_dir,
        &asset_index_path,
        download_source,
    )
    .await?;
    current_step += 1;

    // 8. 下载日志配置
    emit_progress(app_handle, current_step, total_steps, "version.downloadingLogging");
    if let Some(logging) = version.logging {
        let log_configs_dir = minecraft_dir.join("assets").join("log_configs");
        std::fs::create_dir_all(&log_configs_dir)
            .map_err(|e| i18n_err!("errors.version.createDirFailed", e))?;
        let log_url = crate::utils::url::resolve_download_url(&logging.client.file.url, download_source);
        let log_path = log_configs_dir.join(&logging.client.file.id);
        if !log_path.exists() {
            download_file(&state.http_client, &log_url, &log_path).await?;
        }
    }
    current_step += 1;

    emit_progress(app_handle, current_step, total_steps, "version.downloadComplete");

    Ok(())
}

/// 下载单个文件
async fn download_file(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
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

/// 根据当前平台返回应下载的 native classifier 键
fn get_native_classifier(lib: &Library) -> Option<String> {
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

/// 判断是否应该下载该 library（根据 rules 过滤 OS 兼容性）
/// 规则处理逻辑：依次应用所有匹配当前平台的规则，最后一条匹配规则决定结果；无规则时默认允许
fn should_download_library(lib: &Library) -> bool {
    let Some(rules) = &lib.rules else {
        return true;
    };

    let current_os = std::env::consts::OS;
    let mut allowed = true;

    for rule in rules {
        let applies = match &rule.os {
            Some(os_rule) => match &os_rule.name {
                Some(name) => match name.as_str() {
                    "windows" => current_os == "windows",
                    "macos" | "osx" => current_os == "macos",
                    "linux" => current_os == "linux",
                    _ => true,
                },
                None => true,
            },
            None => true,
        };

        if applies {
            allowed = rule.action == "allow";
        }
    }

    allowed
}

/// 将 Maven 坐标推导为 libraries 目录下的相对路径
fn derive_library_path(name: &str) -> String {
    // com.mojang:logging:1.1.1 → com/mojang/logging/1.1.1/logging-1.1.1.jar
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() >= 3 {
        let group = parts[0].replace('.', "/");
        let artifact = parts[1];
        let version = parts[2];
        format!(
            "{}/{}/{}/{}-{}.jar",
            group, artifact, version, artifact, version
        )
    } else {
        format!("{}.jar", name.replace(':', "/"))
    }
}

/// 下载资源文件，使用信号量限制并发数
async fn download_assets(
    client: &reqwest::Client,
    minecraft_dir: &Path,
    asset_index_path: &Path,
    download_source: &DownloadSource,
) -> Result<(), I18nError> {
    let index_content = std::fs::read_to_string(asset_index_path)
        .map_err(|e| i18n_err!("errors.version.readVersionJsonFailed", e))?;
    let index: AssetIndex = serde_json::from_str(&index_content)
        .map_err(|e| i18n_err!("errors.version.parseVersionJsonFailed", e))?;

    let objects_dir = minecraft_dir.join("assets").join("objects");
    std::fs::create_dir_all(&objects_dir)
        .map_err(|e| i18n_err!("errors.version.createAssetsDirFailed", e))?;

    let semaphore = Arc::new(Semaphore::new(8));
    let mut tasks = Vec::new();

    for object in index.objects.values() {
        let hash = object.hash.clone();
        let prefix = &hash[..2];
        let dest = objects_dir.join(prefix).join(&hash);
        if dest.exists() {
            continue;
        }
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let url = crate::utils::url::resolve_download_url(
            &format!(
                "https://resources.download.minecraft.net/{}/{}",
                prefix, hash
            ),
            download_source,
        );

        let permit = semaphore.clone().acquire_owned().await.map_err(|e| {
            I18nError::new("errors.version.downloadFailed")
                .param("url", &url)
                .param("detail", e.to_string())
        })?;
        let client = client.clone();

        tasks.push(tokio::spawn(async move {
            let _permit = permit;
            download_file(&client, &url, &dest).await
        }));
    }

    for task in tasks {
        task.await.map_err(|e| {
            I18nError::new("errors.version.downloadFailed")
                .param("url", "asset")
                .param("detail", e.to_string())
        })??;
    }

    Ok(())
}
