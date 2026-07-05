use crate::i18n::I18nError;
use crate::i18n_err;
use crate::state::app_state::AppState;
use serde::{Deserialize, Serialize};

/// GitHub Release 信息
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct GitHubRelease {
    #[serde(rename = "tag_name")]
    pub tag_name: String,
    pub name: String,
    pub body: String,
    #[serde(rename = "html_url")]
    pub html_url: String,
}

/// 检查启动器更新（通过 GitHub API）
pub async fn check_for_update(state: &AppState) -> Result<Option<GitHubRelease>, I18nError> {
    let url = "https://api.github.com/repos/xiaogouxuan/LanyouLauncher/releases/latest";

    let response = state
        .http_client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "LanyouLauncher")
        .send()
        .await
        .map_err(|e| i18n_err!("errors.update.checkNetworkFailed", e))?;

    if !response.status().is_success() {
        return Err(
            I18nError::new("errors.update.checkHttpFailed")
                .param("status", response.status().to_string())
                .param("url", url),
        );
    }

    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.update.parseUpdateFailed", e))?;

    let current_version = format!("v{}", env!("CARGO_PKG_VERSION"));

    if release.tag_name != current_version {
        Ok(Some(release))
    } else {
        Ok(None)
    }
}