use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::settings::Settings;
use crate::state::app_state::AppState;
use crate::utils::paths;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

/// 获取设置
#[tauri::command]
pub async fn get_settings(
    state: State<'_, AppState>,
) -> Result<Settings, I18nError> {
    let file_path = paths::get_settings_file(&state.launcher_dir);
    if !file_path.exists() {
        return Ok(Settings::default());
    }
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| i18n_err!("errors.settings.readFileFailed", e))?;
    let settings: Settings = serde_json::from_str(&content)
        .unwrap_or_default();
    Ok(settings)
}

/// 保存设置
#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), I18nError> {
    let file_path = paths::get_settings_file(&state.launcher_dir);
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| i18n_err!("errors.settings.serializeFailed", e))?;
    std::fs::write(&file_path, content)
        .map_err(|e| i18n_err!("errors.settings.writeFileFailed", e))?;
    Ok(())
}

/// 自动检测 Java 运行时，返回路径与版本信息，供前端展示
#[tauri::command]
pub async fn detect_java() -> Result<Vec<(String, String)>, I18nError> {
    Ok(crate::services::java::detector::detect_java_runtimes_with_version())
}

/// 为指定 Minecraft 版本选择最合适的 Java 运行时
#[tauri::command]
pub async fn select_java_for_version(
    state: State<'_, AppState>,
    version_id: String,
) -> Result<(String, String), I18nError> {
    let settings_file = paths::get_settings_file(&state.launcher_dir);
    let java_paths = if settings_file.exists() {
        std::fs::read_to_string(&settings_file)
            .ok()
            .and_then(|content| serde_json::from_str::<crate::models::settings::Settings>(&content).ok())
            .map(|s| s.java_paths)
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    Ok(crate::services::java::detector::select_java_for_version(
        &version_id,
        &state.minecraft_dir,
        &java_paths,
    ))
}

/// 自动下载并安装指定主版本的 Java 运行时
#[tauri::command]
pub async fn download_java(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    major: u32,
) -> Result<String, I18nError> {
    crate::services::java::downloader::download_java(&state, &app_handle, major).await
}

/// 获取指定 Java 可执行文件的版本号
#[tauri::command]
pub async fn get_java_version(java_path: String) -> Result<String, I18nError> {
    let version = crate::services::java::detector::get_java_version(&std::path::PathBuf::from(&java_path))
        .unwrap_or_default();
    Ok(version)
}

/// 选择背景图片文件，并将图片复制到启动器配置目录中持久化保存
#[tauri::command]
pub async fn select_background_image(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<String>, I18nError> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
    let tx = std::sync::Mutex::new(Some(tx));

    app.dialog()
        .file()
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif", "bmp"])
        .pick_file(move |file_path| {
            if let Ok(mut lock) = tx.lock() {
                if let Some(sender) = lock.take() {
                    let path_str = file_path.map(|p| p.to_string());
                    let _ = sender.send(path_str);
                }
            }
        });

    let path_opt = rx
        .await
        .map_err(|_| i18n_err!("errors.settings.readFileFailed", "dialog closed"))?;

    let src_path = match path_opt {
        Some(path) => std::path::PathBuf::from(path),
        None => return Ok(None),
    };

    if !src_path.is_file() {
        return Ok(None);
    }

    // 将图片复制到启动器配置目录的 img/backgrounds/ 下，避免原文件被移动/删除后壁纸失效
    let backgrounds_dir = state.launcher_dir.join("img").join("backgrounds");
    std::fs::create_dir_all(&backgrounds_dir)
        .map_err(|e| i18n_err!("errors.settings.createDirFailed", e))?;

    let ext = src_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let file_name = format!("background_{}.{}", timestamp, ext);
    let dest_path = backgrounds_dir.join(&file_name);

    std::fs::copy(&src_path, &dest_path)
        .map_err(|e| i18n_err!("errors.settings.copyFileFailed", e))?;

    // 清理历史上传的背景图，避免长期使用后缓存目录无限增大
    if let Ok(entries) = std::fs::read_dir(&backgrounds_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path != dest_path && path.is_file() {
                let _ = std::fs::remove_file(path);
            }
        }
    }

    Ok(Some(dest_path.to_string_lossy().to_string()))
}