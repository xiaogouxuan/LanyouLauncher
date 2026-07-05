use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::settings::DownloadSource;
use crate::state::app_state::AppState;
use serde::Deserialize;

const MANIFEST_URL: &str = "https://launchermeta.mojang.com/mc/game/version_manifest.json";
const MANIFEST_MIRROR_URL: &str = "https://bmclapi2.bangbang93.com/mc/game/version_manifest.json";

/// Mojang 版本清单中的版本条目
#[derive(Debug, Deserialize)]
pub struct ManifestVersion {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    #[serde(rename = "releaseTime")]
    pub release_time: String,
    pub url: String,
}

/// Mojang 版本清单根结构
#[derive(Debug, Deserialize)]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<ManifestVersion>,
}

#[derive(Debug, Deserialize)]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

/// 获取 Mojang 官方版本清单
pub async fn fetch_manifest(
    state: &AppState,
    download_source: &DownloadSource,
) -> Result<VersionManifest, I18nError> {
    // 根据下载源决定请求顺序，BMCLAPI 优先使用镜像
    let urls: [&str; 2] = match download_source {
        DownloadSource::Official => [MANIFEST_URL, MANIFEST_MIRROR_URL],
        DownloadSource::Bmclapi => [MANIFEST_MIRROR_URL, MANIFEST_URL],
    };

    for url in &urls {
        match state.http_client.get(*url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    return response
                        .json::<VersionManifest>()
                        .await
                        .map_err(|e| i18n_err!("errors.version.parseManifestFailed", e));
                }
            }
            Err(e) => {
                log::warn!("请求版本清单失败 ({}): {}", url, e);
            }
        }
    }

    Err(i18n_err!("errors.version.fetchManifestFailed"))
}