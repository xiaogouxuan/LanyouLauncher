use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::mod_info::ModInfo;
use crate::state::app_state::AppState;
use tauri::State;

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

/// 下载 Mod
#[tauri::command]
pub async fn download_mod(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    mod_id: String,
    source: String,
    version_id: Option<String>,
    target_version: Option<String>,
) -> Result<(), I18nError> {
    let mods_dir = crate::utils::paths::get_mods_dir_for_version(
        &state.minecraft_dir,
        target_version.as_deref(),
    );
    std::fs::create_dir_all(&mods_dir)
        .map_err(|e| i18n_err!("errors.file.createDirFailed", e))?;

    let progress_id = format!("{}:{}", source, mod_id);

    match source.as_str() {
        "Modrinth" => {
            crate::services::mod_platform::modrinth::download_modrinth_mod(
                &state,
                &app_handle,
                &progress_id,
                &mod_id,
                version_id.as_deref().unwrap_or(""),
                &mods_dir,
            )
            .await
        }
        "CurseForge" => {
            crate::services::mod_platform::curseforge::download_curseforge_mod(
                &state,
                &app_handle,
                &progress_id,
                &mod_id,
                version_id.as_deref().unwrap_or(""),
                &mods_dir,
            )
            .await
        }
        _ => Err(i18n_err!("errors.mod.unknownSource")),
    }
}

/// 获取已安装 Mod 列表
#[tauri::command]
pub async fn get_installed_mods(
    state: State<'_, AppState>,
    target_version: Option<String>,
) -> Result<Vec<ModInfo>, I18nError> {
    let mods_dir = crate::utils::paths::get_mods_dir_for_version(
        &state.minecraft_dir,
        target_version.as_deref(),
    );
    if !mods_dir.exists() {
        return Ok(Vec::new());
    }

    let mut mods = Vec::new();
    let entries = std::fs::read_dir(&mods_dir)
        .map_err(|e| i18n_err!("errors.mod.readDirFailed", e))?;

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

            mods.push(ModInfo {
                id: file_name.to_string(),
                name: display_name,
                version: String::new(),
                version_id: String::new(),
                loader: crate::models::version::LoaderType::Fabric,
                game_version: String::new(),
                description: String::new(),
                icon_url: None,
                source: crate::models::mod_info::ModSource::Modrinth,
                enabled,
                dependencies: Vec::new(),
    });
        }
    }

    Ok(mods)
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

    Ok(())
}