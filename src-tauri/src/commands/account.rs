use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::account::{Account, AccountType};
use crate::services::auth::offline::generate_offline_uuid;
use crate::state::app_state::AppState;
use crate::utils::paths;
use std::path::Path;
use base64::{Engine as _, engine::general_purpose};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

/// 获取所有账号
#[tauri::command]
pub async fn get_accounts(state: State<'_, AppState>) -> Result<Vec<Account>, I18nError> {
    let file_path = paths::get_accounts_file(&state.launcher_dir);
    if !file_path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| i18n_err!("errors.account.readFileFailed", e))?;
    let accounts: Vec<Account> = serde_json::from_str(&content)
        .unwrap_or_default();
    Ok(accounts)
}

/// 离线登录
#[tauri::command]
pub async fn login_offline(
    state: State<'_, AppState>,
    username: String,
) -> Result<Account, I18nError> {
    if username.trim().is_empty() {
        return Err(i18n_err!("errors.account.emptyUsername"));
    }

    let uuid = generate_offline_uuid(&username);
    let account = Account {
        id: uuid.clone(),
        username: username.trim().to_string(),
        account_type: AccountType::Offline,
        avatar_url: Some(format!(
            "https://crafatar.com/avatars/{}?size=64&overlay",
            uuid
        )),
        skin_path: None,
        // 离线账号使用 UUID（无横线）作为 accessToken，与 PCL-CE 一致，
        // 避免部分旧版核心（如 1.16.2）因 token 格式问题进入 Demo 模式
        access_token: Some(uuid.replace('-', "")),
        refresh_token: None,
        expires_at: None,
        is_active: true,
    };

    save_account(&state, &account)?;

    Ok(account)
}

/// 微软正版登录
#[tauri::command]
pub async fn login_microsoft(
    app: AppHandle,
    state: State<'_, AppState>,
    window_title: String,
) -> Result<Account, I18nError> {
    let account = crate::services::auth::microsoft::authenticate_microsoft(&app, &state, &window_title).await?;
    save_account(&state, &account)?;
    Ok(account)
}

/// 删除账号
#[tauri::command]
pub async fn delete_account(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), I18nError> {
    let file_path = paths::get_accounts_file(&state.launcher_dir);
    if !file_path.exists() {
        return Err(i18n_err!("errors.account.fileNotFound"));
    }

    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| i18n_err!("errors.account.readFileFailed", e))?;
    let mut accounts: Vec<Account> = serde_json::from_str(&content)
        .unwrap_or_default();

    accounts.retain(|a| a.id != id);

    let new_content = serde_json::to_string_pretty(&accounts)
        .map_err(|e| i18n_err!("errors.account.serializeFailed", e))?;
    std::fs::write(&file_path, new_content)
        .map_err(|e| i18n_err!("errors.account.writeFileFailed", e))?;

    Ok(())
}

/// 读取本地皮肤文件并返回 base64 data URL
/// 作为 convertFileSrc 的兜底方案，用于离线账号自定义皮肤的可靠加载
#[tauri::command]
pub fn read_skin_data_url(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Failed to read skin file: {}", e))?;
    let b64 = general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/png;base64,{}", b64))
}

/// 切换活跃账号
#[tauri::command]
pub async fn switch_account(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), I18nError> {
    let file_path = paths::get_accounts_file(&state.launcher_dir);
    if !file_path.exists() {
        return Err(i18n_err!("errors.account.fileNotFound"));
    }

    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| i18n_err!("errors.account.readFileFailed", e))?;
    let mut accounts: Vec<Account> = serde_json::from_str(&content)
        .unwrap_or_default();

    for account in &mut accounts {
        account.is_active = account.id == id;
    }

    let new_content = serde_json::to_string_pretty(&accounts)
        .map_err(|e| i18n_err!("errors.account.serializeFailed", e))?;
    std::fs::write(&file_path, new_content)
        .map_err(|e| i18n_err!("errors.account.writeFileFailed", e))?;

    Ok(())
}

/// 刷新微软账号 Token
#[tauri::command]
pub async fn refresh_token(
    state: State<'_, AppState>,
    id: String,
) -> Result<Account, I18nError> {
    let file_path = paths::get_accounts_file(&state.launcher_dir);
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| i18n_err!("errors.account.readFileFailed", e))?;
    let accounts: Vec<Account> = serde_json::from_str(&content)
        .unwrap_or_default();

    let account = accounts.iter().find(|a| a.id == id)
        .ok_or_else(|| i18n_err!("errors.account.notFound"))?;

    let refresh_token = account.refresh_token.as_ref()
        .ok_or_else(|| i18n_err!("errors.account.noRefreshToken"))?;

    let (new_token, new_refresh, new_expires) = crate::services::auth::microsoft::refresh_microsoft_token(
        &state,
        refresh_token,
    ).await?;

    // 更新账号信息
    let mut updated_account = account.clone();
    updated_account.access_token = Some(new_token);
    updated_account.refresh_token = Some(new_refresh);
    updated_account.expires_at = Some(new_expires);

    // 保存
    let mut accounts: Vec<Account> = accounts;
    if let Some(pos) = accounts.iter().position(|a| a.id == id) {
        accounts[pos] = updated_account.clone();
    }

    let new_content = serde_json::to_string_pretty(&accounts)
        .map_err(|e| i18n_err!("errors.account.serializeFailed", e))?;
    std::fs::write(&file_path, new_content)
        .map_err(|e| i18n_err!("errors.account.writeFileFailed", e))?;

    Ok(updated_account)
}

/// 保存账号到文件
pub(crate) fn save_account(state: &AppState, account: &Account) -> Result<(), I18nError> {
    let file_path = paths::get_accounts_file(&state.launcher_dir);
    let mut accounts: Vec<Account> = if file_path.exists() {
        let content = std::fs::read_to_string(&file_path)
            .map_err(|e| i18n_err!("errors.account.readFileFailed", e))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    // 检查是否已存在
    if let Some(existing) = accounts.iter_mut().find(|a| a.id == account.id) {
        *existing = account.clone();
    } else {
        // 新账号设为活跃，取消其他账号的活跃状态
        for a in &mut accounts {
            a.is_active = false;
        }
        accounts.push(account.clone());
    }

    let content = serde_json::to_string_pretty(&accounts)
        .map_err(|e| i18n_err!("errors.account.serializeFailed", e))?;
    std::fs::write(&file_path, content)
        .map_err(|e| i18n_err!("errors.account.writeFileFailed", e))?;

    Ok(())
}

/// 为离线账号选择自定义皮肤文件（PNG 格式）
#[tauri::command]
pub async fn select_account_skin(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<String>, I18nError> {
    let file_path = paths::get_accounts_file(&state.launcher_dir);
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| i18n_err!("errors.account.readFileFailed", e))?;
    let mut accounts: Vec<Account> = serde_json::from_str(&content)
        .unwrap_or_default();

    let account = accounts.iter_mut().find(|a| a.id == id)
        .ok_or_else(|| i18n_err!("errors.account.notFound"))?;

    if account.account_type != AccountType::Offline {
        return Err(i18n_err!("errors.account.skinOnlyOffline"));
    }

    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
    let tx = std::sync::Mutex::new(Some(tx));

    app.dialog()
        .file()
        .add_filter("PNG Images", &["png"])
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

    if let Some(ref path) = path_opt {
        if !Path::new(path).is_file() {
            return Ok(None);
        }
        account.skin_path = Some(path.clone());
        let new_content = serde_json::to_string_pretty(&accounts)
            .map_err(|e| i18n_err!("errors.account.serializeFailed", e))?;
        std::fs::write(&file_path, new_content)
            .map_err(|e| i18n_err!("errors.account.writeFileFailed", e))?;
    }

    Ok(path_opt)
}

/// 清除离线账号的自定义皮肤
#[tauri::command]
pub async fn clear_account_skin(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), I18nError> {
    let file_path = paths::get_accounts_file(&state.launcher_dir);
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| i18n_err!("errors.account.readFileFailed", e))?;
    let mut accounts: Vec<Account> = serde_json::from_str(&content)
        .unwrap_or_default();

    if let Some(account) = accounts.iter_mut().find(|a| a.id == id) {
        account.skin_path = None;
        let new_content = serde_json::to_string_pretty(&accounts)
            .map_err(|e| i18n_err!("errors.account.serializeFailed", e))?;
        std::fs::write(&file_path, new_content)
            .map_err(|e| i18n_err!("errors.account.writeFileFailed", e))?;
    }

    Ok(())
}