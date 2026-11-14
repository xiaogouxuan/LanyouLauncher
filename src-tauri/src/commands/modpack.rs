use crate::i18n::I18nError;
use crate::services::modpack::ImportedModpack;
use crate::state::app_state::AppState;
use tauri::State;

/// 导入整合包
/// - `path`：整合包 zip / mrpack 路径（前端拖拽得到）
/// - `format`：auto（自动识别，推荐）/ curseforge / modrinth / lanyou
///
/// 缺少原版或加载器时会自动补齐，导入完成后返回新版本 ID 供前端选中。
#[tauri::command]
pub async fn import_modpack(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
    format: String,
) -> Result<ImportedModpack, I18nError> {
    crate::services::modpack::import_modpack(&state, &app, &path, &format).await
}
