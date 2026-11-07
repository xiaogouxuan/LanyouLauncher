use crate::i18n::I18nError;
use crate::models::launch::LaunchConfig;
use crate::services::launch::process;
use crate::state::app_state::AppState;
use tauri::State;

/// 启动 Minecraft 游戏，返回进程 PID
#[tauri::command]
pub async fn start_game(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    config: LaunchConfig,
) -> Result<u32, I18nError> {
    process::spawn_minecraft(&config, &state, &app_handle).await
}

/// 停止 Minecraft 游戏
/// - pid 为 None 时停止所有活跃进程
/// - pid 为 Some 时停止指定进程
#[tauri::command]
pub async fn stop_game(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    pid: Option<u32>,
) -> Result<(), I18nError> {
    process::kill_minecraft(&state, pid, &app_handle).await
}

