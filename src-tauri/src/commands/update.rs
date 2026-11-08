use crate::i18n::I18nError;
use crate::services::update::checker::UpdateRelease;
use crate::state::app_state::AppState;
use tauri::{AppHandle, State};

/// 检查启动器更新（Gitee 主仓库优先，GitHub 镜像回退）
#[tauri::command]
pub async fn check_update(
    state: State<'_, AppState>,
    current_version: String,
) -> Result<Option<UpdateRelease>, I18nError> {
    crate::services::update::checker::check_for_update(&state, &current_version).await
}

/// 下载更新并自动替换当前程序，完成后自动重启
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    state: State<'_, AppState>,
    download_url: String,
) -> Result<(), I18nError> {
    crate::services::update::installer::start_self_update(&state, &app, &download_url).await
}
