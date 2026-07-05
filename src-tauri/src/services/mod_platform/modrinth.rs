// Deserialization-only fields
#![allow(dead_code)]

use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::mod_info::{ModInfo, ModSource};
use crate::models::version::LoaderType;
use crate::state::app_state::AppState;
use serde::Deserialize;
use tauri::Emitter;

const MODRINTH_API: &str = "https://api.modrinth.com/v2";

#[derive(Debug, Deserialize)]
struct ModrinthSearchResponse {
    hits: Vec<ModrinthSearchHit>,
}

#[derive(Debug, Deserialize)]
struct ModrinthSearchHit {
    project_id: String,
    title: String,
    description: String,
    icon_url: Option<String>,
    versions: Vec<String>,
    categories: Vec<String>,
    client_side: String,
    server_side: String,
    downloads: u64,
}

#[derive(Debug, Deserialize)]
struct ModrinthProject {
    id: String,
    title: String,
    description: String,
    icon_url: Option<String>,
    game_versions: Vec<String>,
    categories: Vec<String>,
    loaders: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ModrinthVersion {
    id: String,
    name: String,
    version_number: String,
    game_versions: Vec<String>,
    loaders: Vec<String>,
    files: Vec<ModrinthFile>,
    dependencies: Vec<ModrinthDependency>,
}

#[derive(Debug, Deserialize)]
struct ModrinthFile {
    url: String,
    filename: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
struct ModrinthDependency {
    project_id: Option<String>,
    version_id: Option<String>,
    dependency_type: String,
}

/// 搜索 Modrinth Mod
/// 返回的每个 Mod 都会匹配指定的游戏版本和加载器，避免下载到不兼容版本
pub async fn search_modrinth(
    state: &AppState,
    query: &str,
    version: Option<&str>,
    loader: Option<&str>,
) -> Result<Vec<ModInfo>, I18nError> {
    let mut facets: Vec<String> = Vec::new();

    // 添加版本过滤
    if let Some(v) = version {
        facets.push(format!("[[\"versions:{}\"]]", v));
    }

    // 添加加载器过滤
    let loader_str = loader.map(|l| match l.to_lowercase().as_str() {
        "forge" => "forge",
        "fabric" => "fabric",
        "neoforge" => "neoforge",
        "quilt" => "quilt",
        _ => l,
    });
    if let Some(l) = loader_str {
        facets.push(format!("[[\"categories:{}\"]]", l));
    }

    let facets_param = if facets.is_empty() {
        String::new()
    } else {
        format!("&facets=[{}]", facets.join(","))
    };

    let encoded_query: String = url::form_urlencoded::byte_serialize(query.as_bytes()).collect();
    let url = format!(
        "{}/search?query={}&limit=20{}",
        MODRINTH_API, encoded_query, facets_param
    );

    let response = state
        .http_client
        .get(&url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.mod.modrinthSearchFailed", e))?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(i18n_err!("errors.mod.modrinthSearchFailed", text));
    }

    let body: ModrinthSearchResponse = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.mod.parseModrinthResponseFailed", e))?;

    let loader_type = parse_loader_type(loader);

    // 为每个项目查找最匹配的版本
    let mut results = Vec::new();
    for hit in body.hits {
        let matched = find_best_modrinth_version(
            state,
            &hit.project_id,
            version,
            loader_str,
        )
        .await;

        if let Ok(Some(v)) = matched {
            let dependencies = v
                .dependencies
                .into_iter()
                .filter(|d| d.dependency_type == "required")
                .filter_map(|d| {
                    d.project_id.map(|id| crate::models::mod_info::ModDependency {
                        id,
                        name: String::new(),
                        required: true,
                    })
                })
                .collect();
            results.push(ModInfo {
                id: hit.project_id,
                name: hit.title,
                version: v.version_number.clone(),
                version_id: v.id,
                loader: loader_type.clone(),
                game_version: v
                    .game_versions
                    .first()
                    .cloned()
                    .unwrap_or_else(|| version.unwrap_or("").to_string()),
                description: hit.description,
                icon_url: hit.icon_url,
                source: ModSource::Modrinth,
                enabled: true,
                dependencies,
            });
        }
    }

    Ok(results)
}

/// 从 Modrinth 项目版本中选出匹配目标游戏版本和加载器的最新版本
async fn find_best_modrinth_version(
    state: &AppState,
    project_id: &str,
    version: Option<&str>,
    loader: Option<&str>,
) -> Result<Option<ModrinthVersion>, I18nError> {
    let url = format!("{}/project/{}/version", MODRINTH_API, project_id);
    let response = state
        .http_client
        .get(&url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.mod.fetchModrinthVersionFailed", e))?;

    let versions: Vec<ModrinthVersion> = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.mod.parseVersionInfoFailed", e))?;

    // Modrinth 返回的版本默认按时间倒序，取第一个匹配的即可
    let matched = versions.into_iter().find(|v| {
        let game_match = version.map(|target| v.game_versions.iter().any(|gv| gv == target)).unwrap_or(true);
        let loader_match = loader.map(|target| v.loaders.iter().any(|l| l.eq_ignore_ascii_case(target))).unwrap_or(true);
        game_match && loader_match && !v.files.is_empty()
    });

    Ok(matched)
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

async fn fetch_modrinth_versions(
    state: &AppState,
    ids: &[String],
) -> Result<std::collections::HashMap<String, ModrinthVersion>, I18nError> {
    let ids_json = serde_json::to_string(ids).unwrap_or_default();
    let url = format!("{}/versions?ids={}", MODRINTH_API, ids_json);

    let response = state
        .http_client
        .get(&url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.mod.fetchModrinthVersionsFailed", e))?;

    let versions: Vec<ModrinthVersion> = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.mod.parseModrinthVersionsFailed", e))?;

    let map = versions.into_iter().map(|v| (v.id.clone(), v)).collect();
    Ok(map)
}

/// 获取 Modrinth Mod 详情
pub async fn get_modrinth_mod(
    state: &AppState,
    mod_id: &str,
) -> Result<ModInfo, I18nError> {
    let project_url = format!("{}/project/{}", MODRINTH_API, mod_id);
    let project_response = state
        .http_client
        .get(&project_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.mod.fetchModrinthProjectFailed", e))?;

    let project: ModrinthProject = project_response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.mod.parseProjectDetailsFailed", e))?;

    // 获取首个可用版本 ID 作为 version_id
    let versions_url = format!("{}/project/{}/version", MODRINTH_API, mod_id);
    let version_id = state
        .http_client
        .get(&versions_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.mod.fetchModrinthVersionFailed", e))?
        .json::<Vec<ModrinthVersion>>()
        .await
        .map_err(|e| i18n_err!("errors.mod.parseVersionInfoFailed", e))?
        .into_iter()
        .next()
        .map(|v| v.id)
        .unwrap_or_default();

    Ok(ModInfo {
        id: project.id,
        name: project.title,
        version: project.game_versions.first().cloned().unwrap_or_default(),
        version_id,
        loader: LoaderType::Fabric,
        game_version: project.game_versions.first().cloned().unwrap_or_default(),
        description: project.description,
        icon_url: project.icon_url,
        source: ModSource::Modrinth,
        enabled: true,
        dependencies: Vec::new(),
    })
}

/// 下载 Modrinth Mod 文件
pub async fn download_modrinth_mod(
    state: &AppState,
    app_handle: &tauri::AppHandle,
    progress_id: &str,
    _mod_id: &str,
    version_id: &str,
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

    // 获取版本信息
    let version_url = format!("{}/version/{}", MODRINTH_API, version_id);
    let response = state
        .http_client
        .get(&version_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.mod.fetchModrinthVersionFailed", e))?;

    let version: ModrinthVersion = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.mod.parseVersionInfoFailed", e))?;

    emit_progress(app_handle, 1, 3, "mod.downloadingFile");

    // 下载主文件
    let file = version
        .files
        .first()
        .ok_or(i18n_err!("errors.mod.noDownloadableFile"))?;

    let dest = output_dir.join(&file.filename);
    let bytes = state
        .http_client
        .get(&file.url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.mod.downloadModFileFailed", e))?
        .bytes()
        .await
        .map_err(|e| i18n_err!("errors.mod.readModFileFailed", e))?;

    emit_progress(app_handle, 2, 3, "mod.writingFile");

    std::fs::write(&dest, &bytes)
        .map_err(|e| {
            I18nError::new("errors.mod.writeModFileFailed")
                .param("path", dest.display().to_string())
                .param("detail", e.to_string())
        })?;

    emit_progress(app_handle, 3, 3, "mod.downloadComplete");

    Ok(())
}