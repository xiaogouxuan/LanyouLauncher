use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::account::{Account, AccountType};
use crate::state::app_state::AppState;

/// authlib-injector 元数据地址（优先使用 BMCLAPI 镜像）
const AUTHLIB_LATEST_URLS: [&str; 2] = [
    "https://bmclapi2.bangbang93.com/mirrors/authlib-injector/artifact/latest.json",
    "https://authlib-injector.yushi.moe/artifact/latest.json",
];

fn normalize_server(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

/// 确保 authlib-injector 已下载到启动器数据目录，返回本地路径。
/// 该 jar 与认证服务器无关，可全局复用。
pub async fn ensure_authlib_injector(state: &AppState) -> Result<std::path::PathBuf, I18nError> {
    let jar_path = state.launcher_dir.join("authlib-injector.jar");
    if jar_path.exists() {
        if let Ok(meta) = std::fs::metadata(&jar_path) {
            if meta.len() > 0 {
                return Ok(jar_path);
            }
        }
    }

    let mut download_url: Option<String> = None;
    for url in AUTHLIB_LATEST_URLS {
        let response = match state.http_client.get(url).send().await {
            Ok(response) => response,
            Err(_) => continue,
        };
        if !response.status().is_success() {
            continue;
        }
        let body: serde_json::Value = match response.json().await {
            Ok(body) => body,
            Err(_) => continue,
        };
        if let Some(url) = body["download_url"].as_str() {
            download_url = Some(url.to_string());
            break;
        }
    }

    let download_url = download_url.ok_or(i18n_err!(
        "errors.thirdparty.fetchInjectorFailed",
        ""
    ))?;

    let bytes = state
        .http_client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.thirdparty.downloadInjectorFailed", e))?
        .bytes()
        .await
        .map_err(|e| i18n_err!("errors.thirdparty.downloadInjectorFailed", e))?;

    std::fs::write(&jar_path, &bytes)
        .map_err(|e| i18n_err!("errors.thirdparty.downloadInjectorFailed", e))?;

    Ok(jar_path)
}

/// 外置登录（Yggdrasil 协议 / authlib-injector）
pub async fn authenticate_third_party(
    state: &AppState,
    auth_server: &str,
    username: &str,
    password: &str,
) -> Result<Account, I18nError> {
    let server = normalize_server(auth_server);
    if server.is_empty() {
        return Err(i18n_err!("errors.thirdparty.emptyServer"));
    }
    let parsed = url::Url::parse(&server)
        .map_err(|_| i18n_err!("errors.thirdparty.invalidServer", server.clone()))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(i18n_err!("errors.thirdparty.invalidServer", server.clone()));
    }
    if username.trim().is_empty() {
        return Err(i18n_err!("errors.thirdparty.emptyUsername"));
    }
    if password.is_empty() {
        return Err(i18n_err!("errors.thirdparty.emptyPassword"));
    }

    // 确保注入器可用（登录阶段就给用户明确反馈，避免启动时才失败）
    ensure_authlib_injector(state).await?;

    let url = format!("{}/authserver/authenticate", server);
    let payload = serde_json::json!({
        "agent": { "name": "Minecraft", "version": "1" },
        "username": username.trim(),
        "password": password,
        "requestUser": false,
    });

    let response = state
        .http_client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.thirdparty.authFailed", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(i18n_err!(
            "errors.thirdparty.authRejected",
            format!("{} {}", status, body)
        ));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.thirdparty.parseResponseFailed", e))?;

    let access_token = body["accessToken"]
        .as_str()
        .ok_or(i18n_err!("errors.thirdparty.parseResponseFailed", "missing accessToken"))?
        .to_string();

    let profile = body["selectedProfile"]
        .as_object()
        .ok_or(i18n_err!("errors.thirdparty.noProfile"))?;
    let profile_id = profile
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or(i18n_err!("errors.thirdparty.noProfile"))?
        .replace('-', "")
        .to_lowercase();
    let profile_name = profile
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or(i18n_err!("errors.thirdparty.noProfile"))?
        .to_string();

    Ok(Account {
        id: profile_id,
        username: profile_name,
        account_type: AccountType::ThirdParty,
        avatar_url: None,
        skin_path: None,
        access_token: Some(access_token),
        refresh_token: None,
        expires_at: None,
        is_active: true,
        auth_server: Some(server),
    })
}
