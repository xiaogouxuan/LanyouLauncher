use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::mod_info::{DownloadedModFile, ModInfo, ModSource, ModVersionInfo};
use crate::state::app_state::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

/// 记录已安装 Mod 来源信息的索引文件（与 jar 同目录，游戏会忽略非 jar 文件）
const MOD_INDEX_FILE: &str = ".lanyou-index.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct ModsIndex {
    #[serde(default)]
    entries: HashMap<String, InstalledModMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct InstalledModMeta {
    project_id: String,
    version_id: String,
    version: String,
    source: String,
    name: String,
}

fn load_mods_index(mods_dir: &std::path::Path) -> ModsIndex {
    std::fs::read_to_string(mods_dir.join(MOD_INDEX_FILE))
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn save_mods_index(mods_dir: &std::path::Path, index: &ModsIndex) {
    if let Ok(content) = serde_json::to_string_pretty(index) {
        let _ = std::fs::write(mods_dir.join(MOD_INDEX_FILE), content);
    }
}

/// 搜索 Modrinth
#[tauri::command]
pub async fn search_modrinth(
    state: State<'_, AppState>,
    query: String,
    version: Option<String>,
    loader: Option<String>,
) -> Result<Vec<ModInfo>, I18nError> {
    crate::services::mod_platform::modrinth::search_modrinth(
        &state,
        &query,
        version.as_deref(),
        loader.as_deref(),
    )
    .await
}

/// 搜索 CurseForge
#[tauri::command]
pub async fn search_curseforge(
    state: State<'_, AppState>,
    query: String,
    version: Option<String>,
    loader: Option<String>,
) -> Result<Vec<ModInfo>, I18nError> {
    crate::services::mod_platform::curseforge::search_curseforge(
        &state,
        &query,
        version.as_deref(),
        loader.as_deref(),
    )
    .await
}

/// 获取 Mod 的所有可用版本
#[tauri::command]
pub async fn get_mod_versions(
    state: State<'_, AppState>,
    mod_id: String,
    source: String,
    version: Option<String>,
    loader: Option<String>,
) -> Result<Vec<ModVersionInfo>, I18nError> {
    match source.as_str() {
        "Modrinth" => {
            crate::services::mod_platform::modrinth::get_modrinth_versions(
                &state,
                &mod_id,
                version.as_deref(),
                loader.as_deref(),
            )
            .await
        }
        "CurseForge" => {
            crate::services::mod_platform::curseforge::get_curseforge_files(
                &state,
                &mod_id,
                version.as_deref(),
                loader.as_deref(),
            )
            .await
        }
        _ => Err(i18n_err!("errors.mod.unknownSource")),
    }
}

/// 获取 Mod 详情
/// 供首页推荐卡片等入口直接通过项目 ID 打开详情页，无需依赖搜索结果
#[tauri::command]
pub async fn get_mod_details(
    state: State<'_, AppState>,
    mod_id: String,
    source: Option<String>,
) -> Result<ModInfo, I18nError> {
    match source.as_deref().unwrap_or("Modrinth") {
        "CurseForge" => {
            crate::services::mod_platform::curseforge::get_curseforge_mod(&state, &mod_id).await
        }
        _ => crate::services::mod_platform::modrinth::get_modrinth_mod(&state, &mod_id).await,
    }
}

/// 下载 Mod 到指定版本目录
/// 下载新版本时会先删除同 Mod 旧文件，保证每个 Mod 只有一个版本
#[tauri::command]
pub async fn download_mod(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    mod_id: String,
    source: String,
    version_id: String,
    target_version: Option<String>,
) -> Result<DownloadedModFile, I18nError> {
    let mods_dir = crate::utils::paths::get_mods_dir_for_version(
        &state.minecraft_dir,
        target_version.as_deref(),
    );
    std::fs::create_dir_all(&mods_dir)
        .map_err(|e| i18n_err!("errors.file.createDirFailed", e))?;

    // 下载前删除同 Mod 旧文件
    cleanup_old_mod_files(&mods_dir, &mod_id, &source)?;

    let progress_id = format!("{}:{}", source, mod_id);

    let downloaded = match source.as_str() {
        "Modrinth" => {
            crate::services::mod_platform::modrinth::download_modrinth_mod(
                &state,
                &app_handle,
                &progress_id,
                &mod_id,
                &version_id,
                &mods_dir,
            )
            .await?
        }
        "CurseForge" => {
            crate::services::mod_platform::curseforge::download_curseforge_mod(
                &state,
                &app_handle,
                &progress_id,
                &mod_id,
                &version_id,
                &mods_dir,
            )
            .await?
        }
        _ => return Err(i18n_err!("errors.mod.unknownSource")),
    };

    // 记录来源信息，供已安装列表与更新检查使用
    let mut index = load_mods_index(&mods_dir);
    index.entries.insert(
        downloaded.file_name.clone(),
        InstalledModMeta {
            project_id: mod_id.clone(),
            version_id: version_id.clone(),
            version: downloaded.version_number.clone(),
            source: source.clone(),
            name: downloaded.name.clone(),
        },
    );
    // 清理已不存在的旧条目
    index.entries.retain(|file, _| {
        mods_dir.join(file).exists() || mods_dir.join(format!("{}.disabled", file)).exists()
    });
    save_mods_index(&mods_dir, &index);

    Ok(downloaded)
}

/// 下载 Mod 到本地（弹出保存对话框）
#[tauri::command]
pub async fn download_mod_to_local(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    mod_id: String,
    source: String,
    version_id: String,
    file_name: String,
) -> Result<String, I18nError> {
    // 先获取下载 URL
    let download_url = match source.as_str() {
        "Modrinth" => {
            let url = format!(
                "https://api.modrinth.com/v2/version/{}",
                version_id
            );
            let response = state
                .http_client
                .get(&url)
                .send()
                .await
                .map_err(|e| i18n_err!("errors.mod.fetchModrinthVersionFailed", e))?;
            let body: serde_json::Value = response
                .json()
                .await
                .map_err(|e| i18n_err!("errors.mod.parseVersionInfoFailed", e))?;
            body["files"]
                .as_array()
                .and_then(|files| files.first())
                .and_then(|f| f["url"].as_str())
                .map(String::from)
                .ok_or(i18n_err!("errors.mod.noDownloadableFile"))?
        }
        "CurseForge" => {
            let url = format!(
                "https://api.curseforge.com/v1/mods/{}/files/{}",
                mod_id, version_id
            );
            let api_key = crate::services::mod_platform::curseforge::get_curseforge_api_key(&state)?;
            let response = state
                .http_client
                .get(&url)
                .header("x-api-key", &api_key)
                .send()
                .await
                .map_err(|e| i18n_err!("errors.mod.fetchCurseforgeFileFailed", e))?;
            let body: serde_json::Value = response
                .json()
                .await
                .map_err(|e| i18n_err!("errors.mod.parseCurseforgeFileFailed", e))?;
            body["data"]["downloadUrl"]
                .as_str()
                .map(String::from)
                .ok_or(i18n_err!("errors.mod.noDownloadUrl"))?
        }
        _ => return Err(i18n_err!("errors.mod.unknownSource")),
    };

    // 弹出保存对话框
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
    let tx = std::sync::Mutex::new(Some(tx));
    app_handle
        .dialog()
        .file()
        .set_file_name(&file_name)
        .save_file(move |path| {
            if let Ok(mut lock) = tx.lock() {
                if let Some(sender) = lock.take() {
                    let _ = sender.send(path.map(|p| p.to_string()));
                }
            }
        });

    let save_path = rx
        .await
        .map_err(|_| i18n_err!("errors.common.dialogClosed"))?
        .ok_or(i18n_err!("errors.common.userCancelled"))?;

    let path = std::path::Path::new(&save_path);

    // 下载文件
    let bytes = state
        .http_client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.mod.downloadModFileFailed", e))?
        .bytes()
        .await
        .map_err(|e| i18n_err!("errors.mod.readModFileFailed", e))?;

    std::fs::write(path, &bytes)
        .map_err(|e| i18n_err!("errors.mod.writeModFileFailed", e))?;

    Ok(path.to_string_lossy().to_string())
}

/// 在文件管理器中打开指定版本的 Mods 目录
#[tauri::command]
pub async fn open_mods_dir(
    state: State<'_, AppState>,
    target_version: Option<String>,
) -> Result<(), I18nError> {
    let mods_dir = crate::utils::paths::get_mods_dir_for_version(
        &state.minecraft_dir,
        target_version.as_deref(),
    );
    std::fs::create_dir_all(&mods_dir)
        .map_err(|e| i18n_err!("errors.file.createDirFailed", e))?;
    open::that(&mods_dir).map_err(|e| i18n_err!("errors.system.openPathFailed", e))
}

/// 获取已安装 Mod 列表
/// target_version 为 None 时扫描全局 mods + 所有版本隔离 mods
#[tauri::command]
pub async fn get_installed_mods(
    state: State<'_, AppState>,
    target_version: Option<String>,
) -> Result<Vec<ModInfo>, I18nError> {
    let mut results = Vec::new();

    if let Some(version_id) = target_version {
        let mods_dir = crate::utils::paths::get_mods_dir_for_version(
            &state.minecraft_dir,
            Some(&version_id),
        );
        let is_isolated = crate::services::version::meta::read_version_meta(
            &state.minecraft_dir,
            &version_id,
        )
        .is_isolated;
        read_mods_in_dir(&mods_dir, &version_id, is_isolated, &mut results)?;
    } else {
        // 扫描全局 mods
        let global_dir = crate::utils::paths::get_global_mods_dir(&state.minecraft_dir);
        read_mods_in_dir(&global_dir, "global", false, &mut results)?;

        // 扫描各版本隔离 mods
        let versions_dir = crate::utils::paths::get_versions_dir(&state.minecraft_dir);
        if let Ok(entries) = std::fs::read_dir(&versions_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let version_id = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                let meta = crate::services::version::meta::read_version_meta(
                    &state.minecraft_dir,
                    &version_id,
                );
                if !meta.is_isolated {
                    continue;
                }
                let mods_dir = path.join("mods");
                read_mods_in_dir(&mods_dir, &version_id, true, &mut results)?;
            }
        }
    }

    Ok(results)
}

/// 从目录读取 Mod 文件信息
fn read_mods_in_dir(
    mods_dir: &std::path::Path,
    instance_id: &str,
    is_isolated: bool,
    out: &mut Vec<ModInfo>,
) -> Result<(), I18nError> {
    if !mods_dir.exists() {
        return Ok(());
    }

    let entries = std::fs::read_dir(mods_dir)
        .map_err(|e| i18n_err!("errors.mod.readDirFailed", e))?;
    let index = load_mods_index(mods_dir);

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = path.file_name().unwrap_or_default().to_string_lossy();

        if path.is_file() && (file_name.ends_with(".jar") || file_name.ends_with(".jar.disabled")) {
            let enabled = file_name.ends_with(".jar");
            let display_name = if enabled {
                file_name.trim_end_matches(".jar").to_string()
            } else {
                file_name.trim_end_matches(".jar.disabled").to_string()
            };
            let lookup_key = file_name.trim_end_matches(".disabled").to_string();
            let meta = index.entries.get(&lookup_key);

            out.push(ModInfo {
                id: file_name.to_string(),
                project_id: meta.map(|m| m.project_id.clone()),
                name: meta.map(|m| m.name.clone()).unwrap_or(display_name),
                version: meta.map(|m| m.version.clone()).unwrap_or_default(),
                version_id: meta.map(|m| m.version_id.clone()).unwrap_or_default(),
                file_name: Some(file_name.to_string()),
                loader: crate::models::version::LoaderType::Fabric,
                game_version: String::new(),
                description: String::new(),
                icon_url: None,
                source: match meta {
                    Some(m) if m.source == "CurseForge" => ModSource::CurseForge,
                    _ => ModSource::Modrinth,
                },
                enabled,
                dependencies: Vec::new(),
                install_path: Some(path.to_string_lossy().to_string()),
                instance_id: Some(instance_id.to_string()),
                is_isolated: Some(is_isolated),
            });
        }
    }

    Ok(())
}

/// 删除同 Mod 旧文件
/// Modrinth 按 project_id 匹配，CurseForge 按 mod_id 匹配
fn cleanup_old_mod_files(
    mods_dir: &std::path::Path,
    mod_id: &str,
    source: &str,
) -> Result<(), I18nError> {
    if !mods_dir.exists() {
        return Ok(());
    }

    let entries = std::fs::read_dir(mods_dir)
        .map_err(|e| i18n_err!("errors.mod.readDirFailed", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        if !(file_name.ends_with(".jar") || file_name.ends_with(".jar.disabled")) {
            continue;
        }

        // 简单启发式：文件名中包含 mod_id（project_id 或 curseforge id）即视为同一 Mod
        // 对于更精确匹配，可后续解析 jar 内的 fabric.mod.json / mods.toml
        let should_delete = matches!(source, "Modrinth" | "CurseForge")
            && file_name.to_lowercase().contains(&mod_id.to_lowercase());

        if should_delete {
            std::fs::remove_file(&path)
                .map_err(|e| i18n_err!("errors.mod.deleteFileFailed", e))?;
        }
    }

    Ok(())
}

/// 启用/禁用 Mod
#[tauri::command]
pub async fn toggle_mod(
    state: State<'_, AppState>,
    mod_id: String,
    enabled: bool,
    target_version: Option<String>,
) -> Result<(), I18nError> {
    let mods_dir = crate::utils::paths::get_mods_dir_for_version(
        &state.minecraft_dir,
        target_version.as_deref(),
    );
    let from_name = if enabled {
        format!("{}.disabled", mod_id)
    } else {
        mod_id.clone()
    };
    let to_name = if enabled {
        mod_id.clone()
    } else {
        format!("{}.disabled", mod_id)
    };

    let from = mods_dir.join(from_name);
    let to = mods_dir.join(to_name);

    if !from.exists() {
        return Err(i18n_err!("errors.mod.fileNotFound"));
    }

    std::fs::rename(&from, &to)
        .map_err(|e| i18n_err!("errors.mod.renameFailed", e))?;

    Ok(())
}

/// 删除 Mod
#[tauri::command]
pub async fn delete_mod(
    state: State<'_, AppState>,
    mod_id: String,
    target_version: Option<String>,
) -> Result<(), I18nError> {
    let mods_dir = crate::utils::paths::get_mods_dir_for_version(
        &state.minecraft_dir,
        target_version.as_deref(),
    );
    let paths = [
        mods_dir.join(&mod_id),
        mods_dir.join(format!("{}.disabled", mod_id)),
    ];

    for path in paths {
        if path.exists() {
            if path.is_file() {
                std::fs::remove_file(&path)
                    .map_err(|e| i18n_err!("errors.mod.deleteFileFailed", e))?;
            } else {
                std::fs::remove_dir_all(&path)
                    .map_err(|e| i18n_err!("errors.mod.deleteDirFailed", e))?;
            }
        }
    }

    // 同步清理来源索引
    let mut index = load_mods_index(&mods_dir);
    index.entries.remove(&mod_id);
    index.entries.remove(&format!("{}.disabled", mod_id));
    save_mods_index(&mods_dir, &index);

    Ok(())
}
