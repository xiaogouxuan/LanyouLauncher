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

/// 选择背景图片文件
#[tauri::command]
pub async fn select_background_image(app: tauri::AppHandle) -> Result<Option<String>, I18nError> {
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

    // 验证文件真实存在
    if let Some(ref path) = path_opt {
        if !std::path::Path::new(path).is_file() {
            return Ok(None);
        }
    }

    Ok(path_opt)
}