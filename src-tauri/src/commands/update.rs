use crate::i18n::I18nError;
use crate::services::update::checker::GitHubRelease;
use crate::state::app_state::AppState;
use tauri::State;

/// 检查启动器更新
#[tauri::command]
pub async fn check_update(
    state: State<'_, AppState>,
) -> Result<Option<GitHubRelease>, I18nError> {
    crate::services::update::checker::check_for_update(&state).await
}