// Deserialization-only fields
#![allow(dead_code)]

use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::mod_info::{DownloadedModFile, ModInfo, ModSource};
use crate::models::version::LoaderType;
use crate::state::app_state::AppState;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::Emitter;

const MODRINTH_API: &str = "https://api.modrinth.com/v2";
/// 版本列表缓存有效期：详情页与版本选择器复用，避免重复请求拖慢界面
const VERSION_CACHE_TTL: Duration = Duration::from_secs(300);

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
    /// Modrinth 搜索结果直接携带最新版本 ID，列表页无需再逐个项目查版本
    #[serde(default)]
    latest_version: Option<String>,
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

#[derive(Debug, Deserialize, Clone)]
struct ModrinthVersion {
    id: String,
    name: String,
    version_number: String,
    game_versions: Vec<String>,
    loaders: Vec<String>,
    files: Vec<ModrinthFile>,
    dependencies: Vec<ModrinthDependency>,
}

#[derive(Debug, Deserialize, Clone)]
struct ModrinthFile {
    url: String,
    filename: String,
    size: u64,
}

#[derive(Debug, Deserialize, Clone)]
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
    // Modrinth 的 facets 是“二维数组”：外层为 AND，内层为 OR
    let mut facets: Vec<Vec<String>> = Vec::new();

    // 添加版本过滤
    if let Some(v) = version {
        facets.push(vec![format!("versions:{}", v)]);
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
        facets.push(vec![format!("categories:{}", l)]);
    }

    let facets_param = if facets.is_empty() {
        String::new()
    } else {
        let json = serde_json::to_string(&facets).unwrap_or_default();
        let encoded: String = url::form_urlencoded::byte_serialize(json.as_bytes()).collect();
        format!("&facets={}", encoded)
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

    // 显式指定加载器时按用户选择；未指定时按项目分类推断，避免给非 Fabric 模组贴错标签
    let loader_type = loader.map(|l| parse_loader_type(Some(l)));

    /*
     * 搜索结果已包含卡片展示所需的全部字段，不再为每个项目单独查询版本列表：
     * 原实现的 20 次并发请求会把列表页拖慢成十几秒，而版本列表在用户
     * 点开某个模组时（get_modrinth_versions）按需加载即可。
     */
    let results = body
        .hits
        .into_iter()
        .map(|hit| {
            let hit_loader = match &loader_type {
                Some(loader) => loader.clone(),
                None => loader_from_categories(&hit.categories),
            };
            ModInfo {
            id: hit.project_id.clone(),
            project_id: Some(hit.project_id),
            name: hit.title,
            version: hit.versions.last().cloned().unwrap_or_default(),
            version_id: hit.latest_version.unwrap_or_default(),
            file_name: None,
            loader: hit_loader,
            game_version: version.map(|v| v.to_string()).unwrap_or_default(),
            description: hit.description,
            icon_url: hit.icon_url,
            source: ModSource::Modrinth,
            enabled: true,
            dependencies: Vec::new(),
            install_path: None,
            instance_id: None,
            is_isolated: None,
            }
        })
        .collect();

    Ok(results)
}

/// Modrinth 项目版本列表缓存（全局共享，5 分钟过期）
fn version_cache() -> &'static Mutex<HashMap<String, (Instant, Vec<ModrinthVersion>)>> {
    static CACHE: OnceLock<Mutex<HashMap<String, (Instant, Vec<ModrinthVersion>)>>> =
        OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 读取项目版本列表，命中缓存时直接返回
async fn fetch_project_versions(
    state: &AppState,
    project_id: &str,
) -> Result<Vec<ModrinthVersion>, I18nError> {
    if let Ok(cache) = version_cache().lock() {
        if let Some((cached_at, versions)) = cache.get(project_id) {
            if cached_at.elapsed() < VERSION_CACHE_TTL {
                return Ok(versions.clone());
            }
        }
    }

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

    if let Ok(mut cache) = version_cache().lock() {
        // 简单容量控制，避免长时间运行后无限增长
        if cache.len() >= 200 {
            cache.retain(|_, (cached_at, _)| cached_at.elapsed() < VERSION_CACHE_TTL);
        }
        cache.insert(project_id.to_string(), (Instant::now(), versions.clone()));
    }

    Ok(versions)
}

/// 获取 Modrinth 项目的所有可用版本（按游戏版本和加载器过滤）
pub async fn get_modrinth_versions(
    state: &AppState,
    project_id: &str,
    version: Option<&str>,
    loader: Option<&str>,
) -> Result<Vec<crate::models::mod_info::ModVersionInfo>, I18nError> {
    let versions = fetch_project_versions(state, project_id).await?;

    let loader_str = loader.map(|l| l.to_lowercase());
    let mut result = Vec::new();
    for v in versions {
        let game_match = version
            .map(|target| v.game_versions.iter().any(|gv| gv == target))
            .unwrap_or(true);
        let loader_match = loader_str
            .as_ref()
            .map(|target| v.loaders.iter().any(|l| l.eq_ignore_ascii_case(target)))
            .unwrap_or(true);
        if !(game_match && loader_match && !v.files.is_empty()) {
            continue;
        }

        let file = &v.files[0];
        let dependencies = v
            .dependencies
            .iter()
            .filter(|d| d.dependency_type == "required")
            .filter_map(|d| {
                d.project_id.as_ref().map(|id| crate::models::mod_info::ModDependency {
                    id: id.clone(),
                    name: String::new(),
                    required: true,
                })
            })
            .collect();

        result.push(crate::models::mod_info::ModVersionInfo {
            version_id: v.id,
            version_number: v.version_number,
            game_versions: v.game_versions,
            loaders: v
                .loaders
                .iter()
                .filter_map(|l| match l.to_lowercase().as_str() {
                    "forge" => Some(LoaderType::Forge),
                    "fabric" => Some(LoaderType::Fabric),
                    "neoforge" => Some(LoaderType::NeoForge),
                    "quilt" => Some(LoaderType::Quilt),
                    _ => None,
                })
                .collect(),
            file_name: file.filename.clone(),
            file_size: file.size,
            download_url: file.url.clone(),
            dependencies,
        });
    }

    Ok(result)
}

/// 搜索结果未指定加载器时，从项目分类中推断一个用于展示的加载器
fn loader_from_categories(categories: &[String]) -> LoaderType {
    for category in categories {
        match category.to_lowercase().as_str() {
            "fabric" => return LoaderType::Fabric,
            "forge" => return LoaderType::Forge,
            "neoforge" => return LoaderType::NeoForge,
            "quilt" => return LoaderType::Quilt,
            _ => {}
        }
    }
    LoaderType::Fabric
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

    // 版本信息走缓存，详情页与搜索结果保持一致，也避免重复请求
    let versions = fetch_project_versions(state, mod_id)
        .await
        .unwrap_or_default();
    let latest = versions.first();
    let version_id = latest.map(|v| v.id.clone()).unwrap_or_default();
    let loader = latest
        .and_then(|v| v.loaders.first())
        .map(|l| l.as_str());

    Ok(ModInfo {
        id: project.id.clone(),
        project_id: Some(project.id),
        name: project.title,
        version: latest
            .map(|v| v.version_number.clone())
            .unwrap_or_default(),
        version_id,
        file_name: latest
            .and_then(|v| v.files.first())
            .map(|f| f.filename.clone()),
        loader: parse_loader_type(loader),
        game_version: project.game_versions.first().cloned().unwrap_or_default(),
        description: project.description,
        icon_url: project.icon_url,
        source: ModSource::Modrinth,
        enabled: true,
        dependencies: Vec::new(),
        install_path: None,
        instance_id: None,
        is_isolated: None,
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
) -> Result<DownloadedModFile, I18nError> {
    let emit_progress = |app: &tauri::AppHandle, current: u64, total: u64, status: &str| {
        let _ = app.emit(
            "download-progress",
            crate::models::version::DownloadProgress {
                id: progress_id.to_string(),
                task_type: "mod_download".to_string(),
                total,
                current,
                status: status.to_string(),
                speed: None,
                stage: None,
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

    Ok(DownloadedModFile {
        file_name: file.filename.clone(),
        version_number: version.version_number.clone(),
        name: version.name.clone(),
    })
}