use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::settings::DownloadSource;
use crate::models::version::{LoaderType, VersionInfo, VersionType};
use crate::state::app_state::AppState;
use chrono::Datelike;
use std::path::Path;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

/// 已知的 Minecraft 愚人节版本 ID（参考 PCL-CE 与 HMCL）
const APRIL_FOOLS_IDS: &[&str] = &[
    "2.0_blue", "2.0_red", "2.0_purple", "2point0_blue", "2point0_red", "2point0_purple", "2.0",
    "20w14infinite", "20w14∞",
    "3d shareware v1.34", "1.rv-pre1", "15w14a", "22w13oneblockatatime",
    "23w13a_or_b", "24w14potato", "25w14craftmine", "26w14a",
];

/// 根据版本 ID 判断是否为已知的愚人节版本
fn is_known_april_fools(id: &str) -> bool {
    let lower = id.to_lowercase();
    APRIL_FOOLS_IDS.iter().any(|&known| lower == known.to_lowercase())
}

/// 规范化版本 ID：将 "2point0_*" 替换为 "2.0_*"
fn normalize_version_id(id: &str) -> String {
    if id.to_lowercase().starts_with("2point0") {
        id.to_lowercase().replace("2point0", "2.0")
    } else {
        id.to_string()
    }
}

/// 根据 version.json 内容判断 Mod 加载器类型
fn detect_loader_from_json(json: &serde_json::Value) -> Option<LoaderType> {
    let main_class = json.get("mainClass").and_then(|v| v.as_str()).unwrap_or("");
    let libraries = json.get("libraries").and_then(|v| v.as_array());

    if main_class.contains("fabricmc") {
        return Some(LoaderType::Fabric);
    }
    if main_class.contains("quiltmc") {
        return Some(LoaderType::Quilt);
    }
    if main_class.contains("forge") || main_class.contains("modlauncher") {
        return Some(LoaderType::Forge);
    }
    if main_class.contains("neoforge") || main_class.contains("neoforged") {
        return Some(LoaderType::NeoForge);
    }

    if let Some(libs) = libraries {
        for lib in libs {
            let name = lib.get("name").and_then(|v| v.as_str()).unwrap_or("");
            if name.starts_with("net.fabricmc:fabric-loader") {
                return Some(LoaderType::Fabric);
            }
            if name.starts_with("org.quiltmc:quilt-loader") {
                return Some(LoaderType::Quilt);
            }
            if name.starts_with("net.minecraftforge:forge") || name.starts_with("net.minecraftforge:fmlloader") {
                return Some(LoaderType::Forge);
            }
            if name.starts_with("net.neoforged.forge") || name.starts_with("net.neoforged:fmlloader") {
                return Some(LoaderType::NeoForge);
            }
        }
    }

    None
}

/// 判断发布日期是否在愚人节（参考 PCL-CE，将 UTC 时间加 2 小时后判断）
fn is_april_fools_by_date(release_time: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(release_time)
        .ok()
        .map(|dt| dt.with_timezone(&chrono::Utc) + chrono::Duration::hours(2))
        .is_some_and(|dt| dt.month() == 4 && dt.day() == 1)
}

/// 获取愚人节版本的 lore 翻译键
fn get_april_fools_lore(id: &str) -> Option<String> {
    let lower = id.to_lowercase();
    let key = if lower.starts_with("2.0") {
        "version.lore.aprilFools.2013"
    } else if lower == "15w14a" {
        "version.lore.aprilFools.2015"
    } else if lower == "1.rv-pre1" {
        "version.lore.aprilFools.2016"
    } else if lower == "3d shareware v1.34" {
        "version.lore.aprilFools.2019"
    } else if lower.starts_with("20w14inf") || lower == "20w14∞" {
        "version.lore.aprilFools.2020"
    } else if lower == "22w13oneblockatatime" {
        "version.lore.aprilFools.2022"
    } else if lower == "23w13a_or_b" {
        "version.lore.aprilFools.2023"
    } else if lower == "24w14potato" {
        "version.lore.aprilFools.2024"
    } else if lower == "25w14craftmine" {
        "version.lore.aprilFools.2025"
    } else if lower == "26w14a" {
        "version.lore.aprilFools.2026"
    } else {
        return None;
    };
    Some(key.to_string())
}

/// 分类结果
struct ClassifiedVersion {
    id: String,
    version_type: VersionType,
    lore: Option<String>,
}

/// 判断版本 ID 是否为预发布版
fn is_pre_release(id_lower: &str) -> bool {
    id_lower.contains("-pre") || id_lower.contains(" pre-release")
}

/// 判断版本 ID 是否为发布候选版
fn is_release_candidate(id_lower: &str) -> bool {
    id_lower.contains("-rc")
        || id_lower.contains(" release candidate ")
        || id_lower.contains(" release candidate")
}

/// 判断版本 ID 是否为反混淆版
fn is_unobfuscated(id_lower: &str) -> bool {
    id_lower.ends_with("_unobfuscated") || id_lower.ends_with(" unobfuscated")
}

/// 将 Mojang 版本清单类型分类为内部版本类型
///
/// 参考 PCL-CE 与 HMCL 的处理：
/// - 已知的愚人节版本 ID 归为 AprilFools
/// - 发布日期在 4 月 1 日的快照也归为 AprilFools
/// - 以 "1." 开头且不含 combat/rc/experimental/pre 的快照/待发布版会被 Mojang 误标，修正为 Release
/// - "old_beta"/"old_alpha" 归为 OldBeta/OldAlpha
/// - 包含 -pre / Pre-Release 的归为 PreRelease
/// - 包含 -rc / Release Candidate 的归为 ReleaseCandidate
/// - 后缀 _unobfuscated / Unobfuscated 的归为 Unobfuscated
fn classify_version(version_type: &str, id: &str, release_time: &str) -> ClassifiedVersion {
    let normalized_id = normalize_version_id(id);
    let id_lower = normalized_id.to_lowercase();

    // 已知愚人节版本
    if is_known_april_fools(&normalized_id) {
        return ClassifiedVersion {
            id: normalized_id,
            version_type: VersionType::AprilFools,
            lore: get_april_fools_lore(&id_lower),
        };
    }

    let base_type = match version_type {
        "release" => VersionType::Release,
        "snapshot" | "pending" => {
            // 先识别特殊后缀
            if is_unobfuscated(&id_lower) {
                VersionType::Unobfuscated
            } else if is_release_candidate(&id_lower) {
                VersionType::ReleaseCandidate
            } else if is_pre_release(&id_lower) {
                VersionType::PreRelease
            } else if id_lower.starts_with("1.")
                && !id_lower.contains("combat")
                && !id_lower.contains("rc")
                && !id_lower.contains("experimental")
                && id_lower != "1.2"
                && !id_lower.contains("pre")
            {
                // 修正 Mojang 对 1.x 快照的误分类
                VersionType::Release
            } else {
                VersionType::Snapshot
            }
        }
        "old_beta" => VersionType::OldBeta,
        "old_alpha" => VersionType::OldAlpha,
        "special" => VersionType::AprilFools,
        _ => VersionType::Snapshot,
    };

    // 快照/待发布版在 4 月 1 日发布的也视为愚人节版本
    let (final_type, lore) = if matches!(
        base_type,
        VersionType::Snapshot | VersionType::Pending | VersionType::PreRelease | VersionType::ReleaseCandidate | VersionType::Unobfuscated
    ) && is_april_fools_by_date(release_time)
    {
        (VersionType::AprilFools, get_april_fools_lore(&id_lower))
    } else {
        (base_type, None)
    };

    ClassifiedVersion {
        id: normalized_id,
        version_type: final_type,
        lore,
    }
}

/// 获取版本清单（远程版本列表）
#[tauri::command]
pub async fn get_manifest(
    state: State<'_, AppState>,
    download_source: DownloadSource,
) -> Result<Vec<VersionInfo>, I18nError> {
    let manifest = crate::services::version::manifest::fetch_manifest(&state, &download_source).await?;
    let versions = manifest.versions.into_iter().map(|v| {
        let classified = classify_version(&v.version_type, &v.id, &v.release_time);
        VersionInfo {
            id: classified.id,
            version_type: classified.version_type,
            release_time: v.release_time,
            loader: None,
            install_time: None,
            is_isolated: false,
            game_dir: None,
            lore: classified.lore,
        }
    }).collect();
    Ok(versions)
}

/// 获取已安装版本列表
#[tauri::command]
pub async fn get_installed_versions(
    state: State<'_, AppState>,
) -> Result<Vec<VersionInfo>, I18nError> {
    let versions_dir = crate::utils::paths::get_versions_dir(&state.minecraft_dir);
    if !versions_dir.exists() {
        return Ok(Vec::new());
    }

    let mut versions = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&versions_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let dir_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                let version_json = path.join(format!("{}.json", dir_name));
                if version_json.exists() {
                    // 读取 version.json 获取真实版本类型、发布时间、加载器类型
                    let (version_type, release_time, lore, loader) = std::fs::read_to_string(&version_json)
                        .ok()
                        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
                        .map(|json| {
                            let vtype = json.get("type").and_then(|t| t.as_str()).unwrap_or("release");
                            let rtime = json.get("releaseTime").and_then(|t| t.as_str()).unwrap_or("").to_string();
                            let classified = classify_version(vtype, &dir_name, &rtime);
                            let loader = detect_loader_from_json(&json);
                            (classified.version_type, rtime, classified.lore, loader)
                        })
                        .unwrap_or((VersionType::Release, String::new(), None, None));

                    // 读取 metadata 获取安装时间
                    let install_time = std::fs::metadata(&version_json)
                        .ok()
                        .and_then(|metadata| metadata.modified().ok())
                        .and_then(|modified| {
                            modified
                                .duration_since(std::time::UNIX_EPOCH)
                                .map(|d| d.as_millis() as i64)
                                .ok()
                        });

                    // 读取启动器元数据（版本隔离、自定义游戏目录）
                    let meta = crate::services::version::meta::read_version_meta(&state.minecraft_dir, &dir_name);
                    let game_dir = if meta.is_isolated {
                        if meta.game_dir.is_empty() {
                            Some(
                                crate::utils::paths::get_version_isolation_dir(&state.minecraft_dir, &dir_name)
                                    .to_string_lossy()
                                    .to_string(),
                            )
                        } else {
                            Some(meta.game_dir)
                        }
                    } else {
                        None
                    };

                    versions.push(VersionInfo {
                        id: dir_name,
                        version_type,
                        release_time,
                        loader,
                        install_time,
                        is_isolated: meta.is_isolated,
                        game_dir,
                        lore,
                    });
                }
            }
        }
    }

    Ok(versions)
}

/// 下载版本
#[tauri::command]
pub async fn download_version(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    version_id: String,
    download_source: DownloadSource,
) -> Result<(), I18nError> {
    crate::services::version::download::download_version(
        &state,
        &version_id,
        &state.minecraft_dir,
        &app_handle,
        &download_source,
    )
    .await
}

/// 安装 Mod 加载器
#[tauri::command]
pub async fn install_loader(
    state: State<'_, AppState>,
    version_id: String,
    loader: String,
) -> Result<(), I18nError> {
    let loader_type = match loader.as_str() {
        "Forge" => LoaderType::Forge,
        "Fabric" => LoaderType::Fabric,
        "NeoForge" => LoaderType::NeoForge,
        "Quilt" => LoaderType::Quilt,
        _ => return Err(i18n_err!("errors.version.unknownLoader", loader)),
    };

    crate::services::version::loader::install_loader(
        &state,
        &version_id,
        &loader_type,
        &state.minecraft_dir,
    )
    .await
}

/// 删除版本
#[tauri::command]
pub async fn delete_version(
    state: State<'_, AppState>,
    version_id: String,
) -> Result<(), I18nError> {
    let versions_dir = crate::utils::paths::get_versions_dir(&state.minecraft_dir);
    let version_dir = versions_dir.join(&version_id);

    if !version_dir.exists() {
        return Err(i18n_err!("errors.version.notFound", version_id));
    }

    std::fs::remove_dir_all(&version_dir)
        .map_err(|e| i18n_err!("errors.version.deleteFailed", e))?;

    Ok(())
}

/// 切换版本隔离状态
#[tauri::command]
pub async fn toggle_version_isolation(
    state: State<'_, AppState>,
    version_id: String,
) -> Result<(), I18nError> {
    let versions_dir = crate::utils::paths::get_versions_dir(&state.minecraft_dir);
    let version_dir = versions_dir.join(&version_id);
    if !version_dir.exists() {
        return Err(i18n_err!("errors.version.notFound", version_id));
    }

    let mut meta = crate::services::version::meta::read_version_meta(&state.minecraft_dir, &version_id);
    meta.is_isolated = !meta.is_isolated;

    // 启用隔离时确保隔离目录存在
    if meta.is_isolated && meta.game_dir.is_empty() {
        let isolation_dir = crate::utils::paths::get_version_isolation_dir(&state.minecraft_dir, &version_id);
        std::fs::create_dir_all(&isolation_dir)
            .map_err(|e| i18n_err!("errors.launch.startProcessFailed", e))?;
    }

    crate::services::version::meta::save_version_meta(&state.minecraft_dir, &version_id, &meta)
        .map_err(|e| i18n_err!("errors.settings.writeFileFailed", e))?;

    Ok(())
}

/// 选择版本的自定义游戏目录
#[tauri::command]
pub async fn select_version_game_dir(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    version_id: String,
) -> Result<Option<String>, I18nError> {
    let versions_dir = crate::utils::paths::get_versions_dir(&state.minecraft_dir);
    if !versions_dir.join(&version_id).exists() {
        return Err(i18n_err!("errors.version.notFound", version_id));
    }

    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
    let tx = std::sync::Mutex::new(Some(tx));

    app.dialog()
        .file()
        .pick_folder(move |folder_path| {
            if let Ok(mut lock) = tx.lock() {
                if let Some(sender) = lock.take() {
                    let path_str = folder_path.map(|p| p.to_string());
                    let _ = sender.send(path_str);
                }
            }
        });

    let path_opt = rx
        .await
        .map_err(|_| i18n_err!("errors.settings.readFileFailed", "dialog closed"))?;

    if let Some(ref path) = path_opt {
        if !Path::new(path).is_dir() {
            return Ok(None);
        }

        let mut meta = crate::services::version::meta::read_version_meta(&state.minecraft_dir, &version_id);
        meta.game_dir = path.clone();
        // 设置自定义目录时自动启用隔离
        meta.is_isolated = true;
        crate::services::version::meta::save_version_meta(&state.minecraft_dir, &version_id, &meta)
            .map_err(|e| i18n_err!("errors.settings.writeFileFailed", e))?;
    }

    Ok(path_opt)
}

/// 清除版本的自定义游戏目录，恢复为默认隔离目录
#[tauri::command]
pub async fn clear_version_game_dir(
    state: State<'_, AppState>,
    version_id: String,
) -> Result<(), I18nError> {
    let versions_dir = crate::utils::paths::get_versions_dir(&state.minecraft_dir);
    if !versions_dir.join(&version_id).exists() {
        return Err(i18n_err!("errors.version.notFound", version_id));
    }

    let mut meta = crate::services::version::meta::read_version_meta(&state.minecraft_dir, &version_id);
    meta.game_dir = String::new();
    crate::services::version::meta::save_version_meta(&state.minecraft_dir, &version_id, &meta)
        .map_err(|e| i18n_err!("errors.settings.writeFileFailed", e))?;

    Ok(())
}