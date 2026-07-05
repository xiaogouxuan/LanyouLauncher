use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::account::{Account, AccountType};
use crate::state::app_state::AppState;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::Rng;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::time::Duration;
use tokio::time::timeout;

const MICROSOFT_CLIENT_ID: &str = "00000000402b5328";
const MICROSOFT_SCOPE: &str = "XboxLive.signin offline_access";
const MICROSOFT_AUTHORIZE_URL: &str = "https://login.live.com/oauth20_authorize.srf";
const MICROSOFT_TOKEN_URL: &str = "https://login.live.com/oauth20_token.srf";
const MICROSOFT_REDIRECT_URI: &str = "https://login.live.com/oauth20_desktop.srf";
const XBOX_AUTH_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_AUTH_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MINECRAFT_AUTH_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MINECRAFT_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";
const MINECRAFT_ENTITLEMENTS_URL: &str = "https://api.minecraftservices.com/entitlements/mcstore";

/// 微软 OAuth 认证流程（完整 PKCE，使用内置 Webview 窗口捕获回调）
pub async fn authenticate_microsoft(
    app: &tauri::AppHandle,
    state: &AppState,
    window_title: &str,
) -> Result<Account, I18nError> {
    // 1. 生成 PKCE 参数与 state
    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);
    let state_param = generate_state();

    // 2. 构建授权 URL
    let auth_url = build_authorize_url(&code_challenge, &state_param);

    // 3. 创建 OAuth 登录窗口并通过导航事件捕获 authorization code
    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    let tx = std::sync::Mutex::new(Some(tx));
    let window_label = "microsoft-oauth";

    let auth_url_parsed: url::Url = auth_url
        .parse::<url::Url>()
        .map_err(|e| i18n_err!("errors.microsoft.openBrowserFailed", e))?;
    let window = tauri::WebviewWindowBuilder::new(
        app,
        window_label,
        tauri::WebviewUrl::External(auth_url_parsed),
    )
    .title(window_title)
    .inner_size(900.0, 700.0)
    .min_inner_size(600.0, 500.0)
    .center()
    .on_navigation(move |url| {
        let url_str = url.as_str();
        if url_str.starts_with(MICROSOFT_REDIRECT_URI) {
            // 优先检查错误回调
            if let Some((error, description)) = extract_error_from_url(url_str) {
                let error_msg = format!("{}: {}", error, description);
                if let Ok(mut lock) = tx.lock() {
                    if let Some(sender) = lock.take() {
                        let _ = sender.send(error_msg);
                    }
                }
                return false;
            }
            if let Some(code) = extract_auth_code_from_url(url_str) {
                if let Ok(mut lock) = tx.lock() {
                    if let Some(sender) = lock.take() {
                        let _ = sender.send(code);
                    }
                }
                return false; // 拦截回调，不再继续导航
            }
        }
        true
    })
    .build()
    .map_err(|e| i18n_err!("errors.microsoft.openBrowserFailed", e))?;

    // 4. 等待用户完成授权或超时
    let callback_result = timeout(Duration::from_secs(300), rx)
        .await
        .map_err(|_| i18n_err!("errors.microsoft.callbackTimeout"))?
        .map_err(|_| i18n_err!("errors.microsoft.waitCallbackFailed", "window closed"))?;

    let _ = window.close();

    // 若返回的是错误信息（以 error 开头），直接报错
    if callback_result.starts_with("error:") || callback_result.starts_with("invalid_") {
        return Err(i18n_err!("errors.microsoft.waitCallbackFailed", callback_result));
    }

    let auth_code = callback_result;

    // 5. 用 authorization_code 换取 access_token
    let ms_token = exchange_microsoft_token(
        &auth_code,
        MICROSOFT_REDIRECT_URI,
        &code_verifier,
        state,
    )
    .await?;

    // 6. Xbox Live 认证
    let xbl_token = authenticate_xbox_live(&ms_token.access_token, state).await?;

    // 7. XSTS 认证
    let xsts = authenticate_xsts(&xbl_token, state).await?;

    // 8. Minecraft 认证
    let mc_token = authenticate_minecraft(&xsts.token, &xsts.user_hash, state).await?;

    // 9. 检查 Minecraft 所有权（HMCL 也做此检查）
    check_minecraft_ownership(&mc_token.access_token, state).await?;

    // 10. 获取 Minecraft 玩家资料
    let profile = fetch_minecraft_profile(&mc_token.access_token, state).await?;

    // 确保 UUID 统一为无横线小写格式
    let profile_id = profile.id.replace('-', "").to_lowercase();

    Ok(Account {
        id: profile_id.clone(),
        username: profile.name,
        account_type: AccountType::Microsoft,
        avatar_url: Some(format!(
            "https://crafatar.com/avatars/{}?size=64&overlay",
            profile_id
        )),
        skin_path: None,
        access_token: Some(mc_token.access_token),
        refresh_token: Some(ms_token.refresh_token),
        expires_at: Some(
            chrono::Utc::now().timestamp() + ms_token.expires_in as i64,
        ),
        is_active: true,
    })
}

/// 生成 PKCE code_verifier
fn generate_code_verifier() -> String {
    let mut rng = rand::thread_rng();
    let chars: Vec<char> = (0..128)
        .map(|_| {
            const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
            CHARSET[rng.gen_range(0..CHARSET.len())] as char
        })
        .collect();
    chars.into_iter().collect()
}

/// 生成 PKCE code_challenge = BASE64URL(SHA256(verifier))
fn generate_code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let result = hasher.finalize();
    URL_SAFE_NO_PAD.encode(result)
}

/// 生成 state 参数，防止 CSRF
fn generate_state() -> String {
    let mut rng = rand::thread_rng();
    let chars: Vec<char> = (0..32)
        .map(|_| {
            const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            CHARSET[rng.gen_range(0..CHARSET.len())] as char
        })
        .collect();
    chars.into_iter().collect()
}

/// 构建微软授权 URL（与 HMCL 兼容的参数集合）
fn build_authorize_url(code_challenge: &str, state: &str) -> String {
    format!(
        "{}?client_id={}&response_type=code&redirect_uri={}&scope={}&prompt=select_account&code_challenge={}&state={}&code_challenge_method=S256",
        MICROSOFT_AUTHORIZE_URL,
        MICROSOFT_CLIENT_ID,
        urlencode(MICROSOFT_REDIRECT_URI),
        urlencode(MICROSOFT_SCOPE),
        code_challenge,
        state
    )
}

/// 从回调 URL 字符串中提取 authorization code
fn extract_auth_code_from_url(url_str: &str) -> Option<String> {
    let parsed = url::Url::parse(url_str).ok()?;
    parsed
        .query_pairs()
        .find(|(k, _)| k == "code")
        .map(|(_, v)| v.to_string())
}

/// 从回调 URL 字符串中提取错误信息
fn extract_error_from_url(url_str: &str) -> Option<(String, String)> {
    let parsed = url::Url::parse(url_str).ok()?;
    let error = parsed
        .query_pairs()
        .find(|(k, _)| k == "error")
        .map(|(_, v)| v.to_string())?;
    let description = parsed
        .query_pairs()
        .find(|(k, _)| k == "error_description")
        .map(|(_, v)| v.to_string())
        .unwrap_or_default();
    Some((error, description))
}

/// URL 编码
fn urlencode(input: &str) -> String {
    url::form_urlencoded::byte_serialize(input.as_bytes()).collect()
}

/// Microsoft token 响应
#[derive(Debug, Deserialize)]
struct MicrosoftTokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

/// 用 authorization_code 换取 Microsoft token
async fn exchange_microsoft_token(
    auth_code: &str,
    redirect_uri: &str,
    code_verifier: &str,
    state: &AppState,
) -> Result<MicrosoftTokenResponse, I18nError> {
    let params = [
        ("client_id", MICROSOFT_CLIENT_ID),
        ("grant_type", "authorization_code"),
        ("code", auth_code),
        ("redirect_uri", redirect_uri),
        ("code_verifier", code_verifier),
    ];

    let response = state
        .http_client
        .post(MICROSOFT_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.microsoft.requestTokenFailed", e))?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(i18n_err!("errors.microsoft.microsoftTokenRequestFailed", text));
    }

    response
        .json::<MicrosoftTokenResponse>()
        .await
        .map_err(|e| i18n_err!("errors.microsoft.parseTokenFailed", e))
}

/// Xbox Live 认证响应
#[derive(Debug, Deserialize)]
struct XboxTokenResponse {
    #[serde(rename = "Token")]
    token: String,
}

/// Xbox Live 认证
async fn authenticate_xbox_live(access_token: &str, state: &AppState) -> Result<String, I18nError> {
    let body = serde_json::json!({
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": format!("d={}", access_token)
        },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT"
    });

    let response = state
        .http_client
        .post(XBOX_AUTH_URL)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.microsoft.xboxAuthFailed", e))?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(i18n_err!("errors.microsoft.xboxAuthHttpFailed", text));
    }

    let xbox: XboxTokenResponse = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.microsoft.parseXboxTokenFailed", e))?;

    Ok(xbox.token)
}

/// XSTS 认证响应
#[derive(Debug, Deserialize)]
struct XstsResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: serde_json::Value,
}

struct XstsToken {
    token: String,
    user_hash: String,
}

/// XSTS 认证
async fn authenticate_xsts(xbl_token: &str, state: &AppState) -> Result<XstsToken, I18nError> {
    let body = serde_json::json!({
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [xbl_token]
        },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT"
    });

    let response = state
        .http_client
        .post(XSTS_AUTH_URL)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.microsoft.xstsAuthFailed", e))?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(i18n_err!("errors.microsoft.xstsAuthHttpFailed", text));
    }

    let xsts: XstsResponse = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.microsoft.parseXstsTokenFailed", e))?;

    let user_hash = xsts
        .display_claims
        .get("xui")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.get("uhs"))
        .and_then(|v| v.as_str())
        .ok_or(i18n_err!("errors.microsoft.xboxUserHashMissing"))?
        .to_string();

    Ok(XstsToken {
        token: xsts.token,
        user_hash,
    })
}

/// Minecraft token 响应
#[derive(Debug, Deserialize)]
struct MinecraftTokenResponse {
    access_token: String,
}

/// Minecraft 认证
async fn authenticate_minecraft(
    xsts_token: &str,
    user_hash: &str,
    state: &AppState,
) -> Result<MinecraftTokenResponse, I18nError> {
    let body = serde_json::json!({
        "identityToken": format!("XBL3.0 x={};{}", user_hash, xsts_token)
    });

    let response = state
        .http_client
        .post(MINECRAFT_AUTH_URL)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.microsoft.minecraftAuthFailed", e))?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(i18n_err!("errors.microsoft.minecraftAuthHttpFailed", text));
    }

    response
        .json::<MinecraftTokenResponse>()
        .await
        .map_err(|e| i18n_err!("errors.microsoft.parseMinecraftTokenFailed", e))
}

/// Minecraft 玩家资料
#[derive(Debug, Deserialize)]
struct MinecraftProfile {
    id: String,
    name: String,
}

/// 获取 Minecraft 玩家资料
async fn fetch_minecraft_profile(
    access_token: &str,
    state: &AppState,
) -> Result<MinecraftProfile, I18nError> {
    let response = state
        .http_client
        .get(MINECRAFT_PROFILE_URL)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.microsoft.fetchProfileFailed", e))?;

    if response.status() == 404 {
        return Err(i18n_err!("errors.microsoft.minecraftNotPurchased"));
    }

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(i18n_err!("errors.microsoft.fetchProfileHttpFailed", text));
    }

    response
        .json::<MinecraftProfile>()
        .await
        .map_err(|e| i18n_err!("errors.microsoft.parseProfileFailed", e))
}

/// 检查微软账号是否拥有 Minecraft（HMCL 参考实现）
async fn check_minecraft_ownership(
    access_token: &str,
    state: &AppState,
) -> Result<(), I18nError> {
    let response = state
        .http_client
        .get(MINECRAFT_ENTITLEMENTS_URL)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.microsoft.minecraftAuthFailed", e))?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(i18n_err!("errors.microsoft.minecraftAuthHttpFailed", text));
    }

    // 如果返回空列表或缺少 items，说明账号未购买 Minecraft
    let body: serde_json::Value = response
        .json()
        .await
        .unwrap_or_default();
    let items = body
        .get("items")
        .and_then(|v| v.as_array())
        .ok_or_else(|| i18n_err!("errors.microsoft.minecraftNotPurchased"))?;
    if items.is_empty() {
        return Err(i18n_err!("errors.microsoft.minecraftNotPurchased"));
    }

    Ok(())
}

/// 获取微软账号玩家头像
pub async fn fetch_player_avatar(
    _state: &AppState,
    _access_token: &str,
) -> Result<Option<String>, I18nError> {
    // Minecraft 头像可以通过 UUID 从 crafatar 获取
    Ok(None)
}

/// 如果微软账号 Token 已过期或即将过期，则自动刷新
pub async fn refresh_microsoft_account_if_needed(
    account: &mut Account,
    state: &AppState,
) -> Result<(), I18nError> {
    if account.account_type != AccountType::Microsoft {
        return Ok(());
    }

    let now = chrono::Utc::now().timestamp();
    let needs_refresh = account
        .expires_at
        .map(|exp| exp <= now + 300)
        .unwrap_or(true);

    if !needs_refresh {
        return Ok(());
    }

    let refresh_token = account
        .refresh_token
        .as_ref()
        .ok_or_else(|| i18n_err!("errors.account.noRefreshToken"))?;

    let (new_access, new_refresh, new_expires) =
        refresh_microsoft_token(state, refresh_token).await?;

    account.access_token = Some(new_access);
    account.refresh_token = Some(new_refresh);
    account.expires_at = Some(new_expires);
    Ok(())
}

/// 刷新微软账号 Token
pub async fn refresh_microsoft_token(
    state: &AppState,
    refresh_token: &str,
) -> Result<(String, String, i64), I18nError> {
    let params = [
        ("client_id", MICROSOFT_CLIENT_ID),
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("scope", "XboxLive.signin offline_access"),
    ];

    let response = state
        .http_client
        .post(MICROSOFT_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.microsoft.refreshTokenFailed", e))?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(i18n_err!("errors.microsoft.refreshTokenHttpFailed", text));
    }

    let token: MicrosoftTokenResponse = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.microsoft.parseRefreshResponseFailed", e))?;

    let expires_at = chrono::Utc::now().timestamp() + token.expires_in as i64;
    Ok((token.access_token, token.refresh_token, expires_at))
}