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
        auth_server: None,
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

/// 外置登录（Yggdrasil / authlib-injector）
#[tauri::command]
pub async fn login_third_party(
    state: State<'_, AppState>,
    auth_server: String,
    username: String,
    password: String,
) -> Result<Account, I18nError> {
    let account = crate::services::auth::thirdparty::authenticate_third_party(
        &state,
        &auth_server,
        &username,
        &password,
    )
    .await?;
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

    let was_active = accounts
        .iter()
        .any(|a| a.id == id && a.is_active);

    accounts.retain(|a| a.id != id);

    // 删除的是当前账号时，自动把剩余的第一个账号设为活跃，
    // 避免前端仍然保留已删除的账号作为“当前账号”。
    if was_active {
        if let Some(first) = accounts.first_mut() {
            first.is_active = true;
        }
    }

    let new_content = serde_json::to_string_pretty(&accounts)
        .map_err(|e| i18n_err!("errors.account.serializeFailed", e))?;
    std::fs::write(&file_path, new_content)
        .map_err(|e| i18n_err!("errors.account.writeFileFailed", e))?;

    Ok(())
}

/// 解析账号的真实皮肤，返回 PNG data URL
///
/// - 微软账号：从 Mojang sessionserver 读取官方皮肤
/// - 外置登录：从认证服务器的 sessionserver 读取皮肤站皮肤
/// - 离线账号：按用户名查询 Mojang 档案，若存在正版档案则使用其皮肤
///
/// 任意一步失败都返回 None，由前端回退到内置皮肤，不影响账号列表加载。
#[tauri::command]
pub async fn resolve_account_skin(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<String>, I18nError> {
    let file_path = paths::get_accounts_file(&state.launcher_dir);
    if !file_path.exists() {
        return Ok(None);
    }

    let content = match std::fs::read_to_string(&file_path) {
        Ok(content) => content,
        Err(_) => return Ok(None),
    };
    let accounts: Vec<Account> = serde_json::from_str(&content).unwrap_or_default();
    let account = match accounts.iter().find(|a| a.id == id) {
        Some(account) => account,
        None => return Ok(None),
    };

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
    {
        Ok(client) => client,
        Err(_) => return Ok(None),
    };

    let skin_url = match account.account_type {
        AccountType::Microsoft => {
            let uuid = account.id.replace('-', "");
            fetch_textures_skin(
                &client,
                &format!(
                    "https://sessionserver.mojang.com/session/minecraft/profile/{}",
                    uuid
                ),
            )
            .await
        }
        AccountType::ThirdParty => match account.auth_server.as_deref() {
            Some(server) if !server.is_empty() => {
                let base = server.trim_end_matches('/');
                let uuid = account.id.replace('-', "");
                fetch_textures_skin(
                    &client,
                    &format!(
                        "{}/sessionserver/session/minecraft/profile/{}?unsigned=false",
                        base, uuid
                    ),
                )
                .await
            }
            _ => None,
        },
        AccountType::Offline => match lookup_mojang_uuid(&client, &account.username).await {
            Some(uuid) => {
                fetch_textures_skin(
                    &client,
                    &format!(
                        "https://sessionserver.mojang.com/session/minecraft/profile/{}",
                        uuid
                    ),
                )
                .await
            }
            None => None,
        },
    };

    let Some(skin_url) = skin_url else {
        return Ok(None);
    };

    let data_url = download_as_data_url(&client, &skin_url).await;
    Ok(data_url)
}

/// 读取 Mojang 档案中的皮肤纹理地址
async fn fetch_textures_skin(client: &reqwest::Client, profile_url: &str) -> Option<String> {
    let response = client.get(profile_url).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let profile: serde_json::Value = response.json().await.ok()?;
    let properties = profile.get("properties")?.as_array()?;
    let textures = properties
        .iter()
        .find(|property| property.get("name").and_then(|name| name.as_str()) == Some("textures"))?;
    let value = textures.get("value")?.as_str()?;
    let decoded = general_purpose::STANDARD.decode(value).ok()?;
    let payload: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    let url = payload
        .get("textures")?
        .get("SKIN")?
        .get("url")?
        .as_str()?
        .replace("http://", "https://");
    Some(url)
}

/// 按用户名查询 Mojang 正版档案 UUID
async fn lookup_mojang_uuid(client: &reqwest::Client, username: &str) -> Option<String> {
    let encoded: String = url::form_urlencoded::byte_serialize(username.as_bytes()).collect();
    let response = client
        .get(format!(
            "https://api.mojang.com/users/profiles/minecraft/{}",
            encoded
        ))
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let profile: serde_json::Value = response.json().await.ok()?;
    Some(profile.get("id")?.as_str()?.to_string())
}

/// 下载皮肤纹理并转换成 data URL
async fn download_as_data_url(client: &reqwest::Client, url: &str) -> Option<String> {
    let response = client.get(url).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let bytes = response.bytes().await.ok()?;
    if bytes.len() < 64 {
        return None;
    }
    let encoded = general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:image/png;base64,{}", encoded))
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