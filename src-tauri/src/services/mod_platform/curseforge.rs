// Deserialization-only fields
#![allow(dead_code)]

use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::mod_info::{ModInfo, ModSource};
use crate::models::version::LoaderType;
use crate::state::app_state::AppState;
use serde::Deserialize;
use tauri::Emitter;

const CURSEFORGE_API: &str = "https://api.curseforge.com/v1";
const CURSEFORGE_API_KEY: &str = "$2a$10$AwzejHxGS4GBJrKYZupFf.1HJOqHHqESpB6v8qNPRHCqMp6XrmpQe";

#[derive(Debug, Deserialize)]
struct CurseForgeSearchResponse {
    data: Vec<CurseForgeMod>,
}

#[derive(Debug, Deserialize)]
struct CurseForgeMod {
    id: u64,
    name: String,
    summary: String,
    logo: Option<CurseForgeLogo>,
    #[serde(rename = "latestFiles")]
    latest_files: Vec<CurseForgeFile>,
    links: Option<CurseForgeLinks>,
}

#[derive(Debug, Deserialize)]
struct CurseForgeLogo {
    url: String,
}

#[derive(Debug, Deserialize)]
struct CurseForgeLinks {
    #[serde(rename = "websiteUrl")]
    website_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CurseForgeFile {
    id: u64,
    #[serde(rename = "fileName")]
    file_name: String,
    #[serde(rename = "downloadUrl")]
    download_url: Option<String>,
    #[serde(rename = "gameVersions")]
    game_versions: Vec<String>,
}

/// 搜索 CurseForge Mod
/// 返回的每个 Mod 都会匹配指定的游戏版本和加载器
pub async fn search_curseforge(
    state: &AppState,
    query: &str,
    version: Option<&str>,
    loader: Option<&str>,
) -> Result<Vec<ModInfo>, I18nError> {
    let encoded_query: String = url::form_urlencoded::byte_serialize(query.as_bytes()).collect();
    let mut url = format!(
        "{}/mods/search?gameId=432&searchFilter={}&pageSize=20",
        CURSEFORGE_API, encoded_query
    );

    if let Some(v) = version {
        url.push_str(&format!("&gameVersion={}", v));
    }

    let loader_type = parse_loader_type(loader);
    let loader_type_id = curseforge_loader_type_id(loader);
    if let Some(id) = loader_type_id {
        url.push_str(&format!("&modLoaderType={}", id));
    }

    let response = state
        .http_client
        .get(&url)
        .header("x-api-key", CURSEFORGE_API_KEY)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.mod.curseforgeSearchFailed", e))?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(i18n_err!("errors.mod.curseforgeSearchFailed", text));
    }

    let body: CurseForgeSearchResponse = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.mod.parseCurseforgeResponseFailed", e))?;

    let mut results = Vec::new();
    for m in body.data {
        let matched = find_best_curseforge_file(
            state,
            m.id,
            version,
            loader_type_id,
        )
        .await;

        if let Ok(Some(file)) = matched {
            results.push(ModInfo {
                id: m.id.to_string(),
                name: m.name,
                version: file.file_name.clone(),
                version_id: file.id.to_string(),
                loader: loader_type.clone(),
                game_version: file
                    .game_versions
                    .first()
                    .cloned()
                    .unwrap_or_else(|| version.unwrap_or("").to_string()),
                description: m.summary,
                icon_url: m.logo.map(|l| l.url),
                source: ModSource::CurseForge,
                enabled: true,
                dependencies: Vec::new(),
            });
        }
    }

    Ok(results)
}

fn parse_loader_type(loader: Option<&str>) -> LoaderType {
    match loader.unwrap_or("fabric").to_lowercase().as_str() {
        "forge" => LoaderType::Forge,
        "fabric" => LoaderType::Fabric,
        "neoforge" => LoaderType::NeoForge,
        "quilt" => LoaderType::Quilt,
        _ => LoaderType::Fabric,
    }
}

fn curseforge_loader_type_id(loader: Option<&str>) -> Option<u64> {
    match loader.unwrap_or("fabric").to_lowercase().as_str() {
        "forge" => Some(1),
        "fabric" => Some(4),
        "quilt" => Some(5),
        "neoforge" => Some(6),
        _ => None,
    }
}

#[derive(Debug, Deserialize)]
struct CurseForgeFilesResponse {
    data: Vec<CurseForgeFile>,
}

/// 从 CurseForge 获取匹配游戏版本和加载器的最新文件
async fn find_best_curseforge_file(
    state: &AppState,
    mod_id: u64,
    version: Option<&str>,
    loader_type_id: Option<u64>,
) -> Result<Option<CurseForgeFile>, I18nError> {
    let mut url = format!("{}/mods/{}/files?pageSize=1", CURSEFORGE_API, mod_id);
    if let Some(v) = version {
        url.push_str(&format!("&gameVersion={}", v));
    }
    if let Some(id) = loader_type_id {
        url.push_str(&format!("&modLoaderType={}", id));
    }

    let response = state
        .http_client
        .get(&url)
        .header("x-api-key", CURSEFORGE_API_KEY)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.mod.fetchCurseforgeFileFailed", e))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let body: CurseForgeFilesResponse = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.mod.parseCurseforgeFileFailed", e))?;

    Ok(body.data.into_iter().next())
}

/// 获取 CurseForge Mod 详情
pub async fn get_curseforge_mod(
    state: &AppState,
    mod_id: &str,
) -> Result<ModInfo, I18nError> {
    let url = format!("{}/mods/{}", CURSEFORGE_API, mod_id);
    let response = state
        .http_client
        .get(&url)
        .header("x-api-key", CURSEFORGE_API_KEY)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.mod.fetchCurseforgeProjectFailed", e))?;

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.mod.parseCurseforgeProjectFailed", e))?;

    let data = &body["data"];
    let latest_file = data["latestFiles"].as_array().and_then(|f| f.first());

    Ok(ModInfo {
        id: data["id"].to_string(),
        name: data["name"].as_str().unwrap_or("Unknown").to_string(),
        version: latest_file
            .and_then(|f| f["gameVersions"].as_array())
            .and_then(|v| v.first())
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        version_id: latest_file
            .and_then(|f| f["id"].as_u64())
            .map(|id| id.to_string())
            .unwrap_or_default(),
        loader: LoaderType::Fabric,
        game_version: latest_file
            .and_then(|f| f["gameVersions"].as_array())
            .and_then(|v| v.first())
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        description: data["summary"].as_str().unwrap_or("").to_string(),
        icon_url: data["logo"]["url"].as_str().map(String::from),
        source: ModSource::CurseForge,
        enabled: true,
        dependencies: Vec::new(),
    })
}

/// 下载 CurseForge Mod 文件
pub async fn download_curseforge_mod(
    state: &AppState,
    app_handle: &tauri::AppHandle,
    progress_id: &str,
    mod_id: &str,
    file_id: &str,
    output_dir: &std::path::Path,
) -> Result<(), I18nError> {
    let emit_progress = |app: &tauri::AppHandle, current: u64, total: u64, status: &str| {
        let _ = app.emit(
            "download-progress",
            crate::models::version::DownloadProgress {
                id: progress_id.to_string(),
                task_type: "mod_download".to_string(),
                total,
                current,
                status: status.to_string(),
            },
        );
    };

    emit_progress(app_handle, 0, 3, "mod.fetchingInfo");

    // 获取文件信息
    let url = format!("{}/mods/{}/files/{}", CURSEFORGE_API, mod_id, file_id);
    let response = state
        .http_client
        .get(&url)
        .header("x-api-key", CURSEFORGE_API_KEY)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.mod.fetchCurseforgeFileFailed", e))?;

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.mod.parseCurseforgeFileFailed", e))?;

    emit_progress(app_handle, 1, 3, "mod.downloadingFile");

    let data = &body["data"];
    let download_url = data["downloadUrl"]
        .as_str()
        .ok_or(i18n_err!("errors.mod.noDownloadUrl"))?;
    let file_name = data["fileName"]
        .as_str()
        .unwrap_or("mod.jar");

    // 下载文件
    let bytes = state
        .http_client
        .get(download_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.mod.downloadCurseforgeFileFailed", e))?
        .bytes()
        .await
        .map_err(|e| i18n_err!("errors.mod.readFileFailed", e))?;

    emit_progress(app_handle, 2, 3, "mod.writingFile");

    let dest = output_dir.join(file_name);
    std::fs::write(&dest, &bytes)
        .map_err(|e| {
            I18nError::new("errors.mod.writeFileFailed")
                .param("path", dest.display().to_string())
                .param("detail", e.to_string())
        })?;

    emit_progress(app_handle, 3, 3, "mod.downloadComplete");

    Ok(())
}