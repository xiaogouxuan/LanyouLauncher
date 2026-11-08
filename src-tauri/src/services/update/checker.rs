use crate::i18n::I18nError;
use crate::i18n_err;
use crate::state::app_state::AppState;
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Gitee 国内主仓库的 Release 列表
const GITEE_RELEASES_API: &str =
    "https://gitee.com/api/v5/repos/xiaogouxuan/lanyou-launcher/releases?per_page=10";
/// GitHub 备用镜像的 Release 列表
const GITHUB_RELEASES_API: &str =
    "https://api.github.com/repos/xiaogouxuan/LanyouLauncher/releases?per_page=10";

/// 可供启动器提示的更新信息
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct UpdateRelease {
    pub tag_name: String,
    pub name: String,
    pub body: String,
    pub html_url: String,
    pub download_url: Option<String>,
    pub published_at: Option<String>,
    /// 数据来源：gitee 或 github
    pub source: String,
}

/// 从发布列表里挑出安装包下载地址
fn pick_download_url(assets: Option<&Vec<Value>>) -> Option<String> {
    let assets = assets?;
    let mut setup: Option<String> = None;
    let mut portable: Option<String> = None;
    let mut fallback: Option<String> = None;

    for asset in assets {
        let name = asset
            .get("name")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_lowercase();
        let url = asset
            .get("browser_download_url")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string());
        let Some(url) = url else { continue };

        if name.contains("portable") && name.ends_with(".exe") {
            portable.get_or_insert(url);
        } else if name.contains("setup") && name.ends_with(".exe") {
            setup.get_or_insert(url);
        } else {
            fallback.get_or_insert(url);
        }
    }

    // 自动更新需要可直接替换的可执行文件，优先取便携版
    portable.or(setup).or(fallback)
}

/// 解析单个 Release 对象，兼容 Gitee 与 GitHub 的字段差异
fn parse_release(raw: &Value, source: &str) -> Option<(Version, UpdateRelease)> {
    let tag = raw.get("tag_name")?.as_str()?.trim();
    let version = Version::parse(tag.trim_start_matches(['v', 'V'])).ok()?;

    let name = raw
        .get("name")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(tag)
        .to_string();
    let body = raw
        .get("body")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let html_url = raw
        .get("html_url")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let published_at = raw
        .get("published_at")
        .or_else(|| raw.get("created_at"))
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());

    let release = UpdateRelease {
        tag_name: tag.to_string(),
        name,
        body,
        html_url,
        download_url: pick_download_url(raw.get("assets").and_then(|value| value.as_array())),
        published_at,
        source: source.to_string(),
    };

    Some((version, release))
}

/// 读取某个平台的 Release 列表，返回其中版本最高的预发布或正式版本
async fn fetch_latest(
    state: &AppState,
    url: &str,
    source: &str,
) -> Result<Option<(Version, UpdateRelease)>, I18nError> {
    let response = state
        .http_client
        .get(url)
        .header("Accept", "application/json")
        .header("User-Agent", "LanyouLauncher")
        .send()
        .await
        .map_err(|e| i18n_err!("errors.update.checkNetworkFailed", e))?;

    if !response.status().is_success() {
        return Err(I18nError::new("errors.update.checkHttpFailed")
            .param("status", response.status().to_string())
            .param("url", url));
    }

    let items: Vec<Value> = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.update.parseUpdateFailed", e))?;

    Ok(items
        .iter()
        .filter_map(|raw| parse_release(raw, source))
        .max_by(|left, right| left.0.cmp(&right.0)))
}

/// 检查启动器更新：Gitee 优先，失败时回退 GitHub
pub async fn check_for_update(
    state: &AppState,
    current_version: &str,
) -> Result<Option<UpdateRelease>, I18nError> {
    let current = Version::parse(current_version.trim().trim_start_matches(['v', 'V']))
        .map_err(|e| i18n_err!("errors.update.parseUpdateFailed", e))?;

    let latest = match fetch_latest(state, GITEE_RELEASES_API, "gitee").await {
        Ok(Some(release)) => Some(release),
        Ok(None) => fetch_latest(state, GITHUB_RELEASES_API, "github").await?,
        Err(gitee_error) => match fetch_latest(state, GITHUB_RELEASES_API, "github").await {
            Ok(release) => release,
            Err(_) => return Err(gitee_error),
        },
    };

    match latest {
        Some((version, mut release)) if version > current => {
            // Gitee 的匿名接口有调用频率限制，超限后会回退到 GitHub。
            // 此时仍把下载地址与发布页替换为 Gitee 对应地址，保证下载走国内主仓库。
            if release.source == "github" {
                if let Some(file) = release
                    .download_url
                    .as_deref()
                    .and_then(|url| url.rsplit('/').next())
                    .map(str::to_string)
                {
                    release.download_url = Some(format!(
                        "https://gitee.com/xiaogouxuan/lanyou-launcher/releases/download/{}/{}",
                        release.tag_name, file
                    ));
                }
                release.html_url = format!(
                    "https://gitee.com/xiaogouxuan/lanyou-launcher/releases/tag/{}",
                    release.tag_name
                );
                release.source = "gitee".to_string();
            }
            Ok(Some(release))
        }
        _ => Ok(None),
    }
}
