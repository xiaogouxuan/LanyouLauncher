use crate::i18n::I18nError;
use crate::models::launch::LaunchConfig;
use crate::services::launch::process;
use crate::state::app_state::AppState;
use tauri::State;

/// 启动 Minecraft 游戏
#[tauri::command]
pub async fn start_game(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    config: LaunchConfig,
) -> Result<(), I18nError> {
    process::spawn_minecraft(&config, &state, &app_handle).await
}

/// 停止 Minecraft 游戏
#[tauri::command]
pub async fn stop_game(
    state: State<'_, AppState>,
) -> Result<(), I18nError> {
    process::kill_minecraft(&state).await
}