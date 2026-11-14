// Deserialization-only fields are expected to be "dead code"
#![allow(dead_code)]

use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::settings::DownloadSource;
use crate::state::app_state::AppState;
use futures_util::StreamExt;
use serde::Deserialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

/// 多文件下载并发数（与 PCL 的 NetTaskThreadLimit 默认值一致）
const DOWNLOAD_CONCURRENCY: usize = 16;
/// 单个地址的失败重试次数
const RETRY_TIMES: u32 = 2;
/// 大文件最多切成多少块并行下载
const CHUNK_COUNT_MAX: usize = 16;
/// 每块最小字节数
const CHUNK_MIN_SIZE: u64 = 1024 * 1024;
/// 达到该体积才启用分块并行，避免小文件切块开销
const CHUNK_ENABLE_SIZE: u64 = 4 * 1024 * 1024;

/// 用户主动取消下载时的统一错误
fn cancelled_error() -> I18nError {
    I18nError::new("errors.version.downloadCancelled")
}

/// Minecraft version.json 完整结构
#[derive(Debug, Deserialize)]
struct VersionJson {
    id: String,
    #[serde(rename = "mainClass")]
    main_class: String,
    arguments: Option<Arguments>,
    #[serde(rename = "minecraftArguments")]
    minecraft_arguments: Option<String>,
    libraries: Vec<Library>,
    downloads: Downloads,
    #[serde(rename = "assetIndex")]
    asset_index: AssetIndexInfo,
    assets: Option<String>,
    logging: Option<LoggingConfig>,
}

#[derive(Debug, Deserialize)]
struct Arguments {
    jvm: Option<Vec<serde_json::Value>>,
    game: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct Downloads {
    client: DownloadArtifact,
}

#[derive(Debug, Deserialize)]
struct AssetIndexInfo {
    id: String,
    sha1: String,
    size: u64,
    url: String,
}

#[derive(Debug, Deserialize)]
struct Library {
    name: String,
    /// 旧版 Forge 等只给 maven 根地址，不给 downloads，需要自行拼接
    url: Option<String>,
    downloads: Option<LibraryDownloads>,
    rules: Option<Vec<Rule>>,
    natives: Option<std::collections::HashMap<String, String>>,
    extract: Option<ExtractRules>,
}

#[derive(Debug, Deserialize)]
struct ExtractRules {
    exclude: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct LibraryDownloads {
    artifact: Option<DownloadArtifact>,
    classifiers: Option<std::collections::HashMap<String, DownloadArtifact>>,
}

#[derive(Debug, Deserialize, Clone)]
struct DownloadArtifact {
    path: Option<String>,
    sha1: String,
    size: u64,
    url: String,
}

#[derive(Debug, Deserialize)]
struct Rule {
    action: String,
    os: Option<OsRule>,
}

#[derive(Debug, Deserialize)]
struct OsRule {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LoggingConfig {
    client: LoggingClient,
}

#[derive(Debug, Deserialize)]
struct LoggingClient {
    file: LoggingFile,
}

#[derive(Debug, Deserialize)]
struct LoggingFile {
    id: String,
    sha1: String,
    size: u64,
    url: String,
}

#[derive(Debug, Deserialize)]
struct AssetIndex {
    objects: std::collections::HashMap<String, AssetObject>,
}

#[derive(Debug, Deserialize)]
struct AssetObject {
    hash: String,
    size: u64,
}

/// 待下载文件
struct PlannedFile {
    /// 多源候选地址：优先源在前，失败后自动切换备用源
    urls: Vec<String>,
    dest: PathBuf,
    size: u64,
}

/// 缺失文件分组
#[derive(Default)]
struct MissingFiles {
    client: Vec<PlannedFile>,
    libraries: Vec<PlannedFile>,
    assets: Vec<PlannedFile>,
    logging: Vec<PlannedFile>,
}

impl MissingFiles {
    fn count(&self) -> usize {
        self.client.len() + self.libraries.len() + self.assets.len() + self.logging.len()
    }

    fn total_size(&self) -> u64 {
        [&self.client, &self.libraries, &self.assets, &self.logging]
            .into_iter()
            .flat_map(|files| files.iter())
            .map(|file| file.size)
            .sum()
    }
}

/// 下载进度上报器：按字节统计并节流发送，让进度条平滑推进
struct ProgressReporter {
    app: tauri::AppHandle,
    id: String,
    total: AtomicU64,
    current: AtomicU64,
    started: Instant,
    last_emit: Mutex<Instant>,
    status: Mutex<String>,
    silent: AtomicBool,
    cancel: Arc<AtomicBool>,
}

impl ProgressReporter {
    fn new(
        app: tauri::AppHandle,
        id: String,
        silent: bool,
        cancel: Arc<AtomicBool>,
    ) -> Self {
        Self {
            app,
            id,
            total: AtomicU64::new(0),
            current: AtomicU64::new(0),
            started: Instant::now(),
            last_emit: Mutex::new(Instant::now() - Duration::from_millis(80)),
            status: Mutex::new(String::new()),
            silent: AtomicBool::new(silent),
            cancel,
        }
    }

    /// 是否收到取消请求
    fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    /// 关闭静默模式，开始上报进度
    fn resume(&self) {
        self.silent.store(false, Ordering::SeqCst);
    }

    fn set_total(&self, total: u64) {
        self.total.store(total, Ordering::SeqCst);
    }

    fn set_status(&self, status: &str) {
        if let Ok(mut current) = self.status.lock() {
            *current = status.to_string();
        }
        self.emit(true);
    }

    fn add(&self, bytes: u64) {
        self.current.fetch_add(bytes, Ordering::Relaxed);
        self.emit(false);
    }

    fn current(&self) -> u64 {
        self.current.load(Ordering::Relaxed)
    }

    /// 失败重试时回滚本轮已上报的字节，避免进度虚高
    fn rollback(&self, bytes: u64) {
        let _ = self.current.fetch_update(
            Ordering::Relaxed,
            Ordering::Relaxed,
            |current| Some(current.saturating_sub(bytes)),
        );
        self.emit(false);
    }

    fn finish(&self, status: &str) {
        let total = self.total.load(Ordering::SeqCst);
        self.current.store(total, Ordering::SeqCst);
        self.set_status(status);
    }

    fn emit(&self, force: bool) {
        if self.silent.load(Ordering::SeqCst) {
            return;
        }

        // 非强制上报时限流，避免高频事件导致界面卡顿
        if !force {
            let Ok(mut last) = self.last_emit.lock() else {
                return;
            };
            if last.elapsed() < Duration::from_millis(60) {
                return;
            }
            *last = Instant::now();
        }

        let total = self.total.load(Ordering::SeqCst);
        let downloaded = self.current.load(Ordering::SeqCst);
        let current = if total > 0 { downloaded.min(total) } else { downloaded };
        let elapsed = self.started.elapsed().as_secs_f64().max(0.05);
        let speed = (current as f64 / elapsed) as u64;
        let status = self
            .status
            .lock()
            .map(|value| value.clone())
            .unwrap_or_default();

        let _ = self.app.emit(
            "download-progress",
            crate::models::version::DownloadProgress {
                id: self.id.clone(),
                task_type: "version_download".to_string(),
                total,
                current,
                status: status.clone(),
                speed: Some(speed),
                stage: Some(status),
            },
        );
    }
}

/// 下载 Minecraft 版本文件：只补全缺失的文件
pub async fn download_version(
    state: &AppState,
    version_id: &str,
    minecraft_dir: &Path,
    app_handle: &tauri::AppHandle,
    download_source: &DownloadSource,
) -> Result<(), I18nError> {
    let cancel = state.register_download_cancel(version_id);
    let result = verify_and_repair_version(
        state,
        version_id,
        minecraft_dir,
        app_handle,
        download_source,
        false,
        Some(cancel),
    )
    .await;
    state.clear_download_cancel(version_id);
    result.map(|_| ())
}

/// 扫描并补全版本文件
/// - 会逐个核对 client、依赖库、资源对象、日志配置的大小，缺失或不完整就重新下载
/// - silent_when_complete 为 true 时，文件齐全不会发送任何进度事件（用于启动前静默自检）
/// - cancel 为外部取消标记，置位后当前下载会在下一个数据块处立即停止
/// - 返回实际补全的文件数量
pub async fn verify_and_repair_version(
    state: &AppState,
    version_id: &str,
    minecraft_dir: &Path,
    app_handle: &tauri::AppHandle,
    download_source: &DownloadSource,
    silent_when_complete: bool,
    cancel: Option<Arc<AtomicBool>>,
) -> Result<usize, I18nError> {
    let versions_dir = crate::utils::paths::get_versions_dir(minecraft_dir);
    let version_dir = versions_dir.join(version_id);
    std::fs::create_dir_all(&version_dir)
        .map_err(|e| i18n_err!("errors.version.createVersionDirFailed", e))?;

    let version_json_path = version_dir.join(format!("{}.json", version_id));
    let reporter = Arc::new(ProgressReporter::new(
        app_handle.clone(),
        version_id.to_string(),
        silent_when_complete,
        cancel.unwrap_or_else(|| Arc::new(AtomicBool::new(false))),
    ));

    if reporter.is_cancelled() {
        return Err(cancelled_error());
    }

    // 1. version.json 缺失时重新获取清单并下载
    if needs_download(&version_json_path, 0) {
        let manifest = crate::services::version::manifest::fetch_manifest(state, download_source).await?;
        let manifest_entry = manifest
            .versions
            .iter()
            .find(|v| v.id == version_id)
            .ok_or_else(|| i18n_err!("errors.version.versionNotInManifest", version_id))?;

        reporter.resume();
        reporter.set_status("version.downloadingMetadata");
        let version_json_urls =
            crate::utils::url::resolve_download_urls(&manifest_entry.url, download_source);
        download_file(&state.http_client, &version_json_urls, &version_json_path).await?;
    }

    // 兼容 HMCL/PCL 与加载器生成的 inheritsFrom 增量版本：先合并父版本再校验文件
    let merged_json =
        crate::services::version::resolve::load_merged_version_json(minecraft_dir, version_id)?;
    let version: VersionJson = serde_json::from_value(merged_json)
        .map_err(|e| i18n_err!("errors.version.parseVersionJsonFailed", e))?;

    // 加载器版本目录通常没有独立 jar：直接复用原版目录的 client.jar，避免重复下载
    let client_jar = version_dir.join(format!("{}.jar", version.id));
    if !client_jar.exists() && version.downloads.client.size > 0 {
        if let Ok(chain) = crate::services::version::resolve::load_version_chain(minecraft_dir, version_id)
        {
            if let Some(base_id) = chain.last().filter(|base| *base != version_id) {
                let base_jar = versions_dir.join(base_id).join(format!("{}.jar", base_id));
                if base_jar.is_file() {
                    let _ = std::fs::copy(&base_jar, &client_jar);
                }
            }
        }
    }

    // 2. asset index 缺失或大小不对时补全，后续才能核对资源对象
    let assets_indexes_dir = minecraft_dir.join("assets").join("indexes");
    std::fs::create_dir_all(&assets_indexes_dir)
        .map_err(|e| i18n_err!("errors.version.createAssetsDirFailed", e))?;
    let asset_index_path = assets_indexes_dir.join(format!("{}.json", version.asset_index.id));
    if needs_download(&asset_index_path, version.asset_index.size) {
        reporter.resume();
        reporter.set_status("version.downloadingMetadata");
        let asset_index_urls =
            crate::utils::url::resolve_download_urls(&version.asset_index.url, download_source);
        download_file(&state.http_client, &asset_index_urls, &asset_index_path).await?;
    }

    let index_content = std::fs::read_to_string(&asset_index_path)
        .map_err(|e| i18n_err!("errors.version.readVersionJsonFailed", e))?;
    let index: AssetIndex = serde_json::from_str(&index_content)
        .map_err(|e| i18n_err!("errors.version.parseVersionJsonFailed", e))?;

    // 3. 全量扫描缺失文件
    let missing = scan_missing_files(&version, minecraft_dir, &version_dir, &index, download_source);
    if missing.count() == 0 {
        reporter.finish("version.downloadComplete");
        return Ok(0);
    }

    reporter.resume();
    reporter.set_total(missing.total_size());

    // 启动前静默自检时统一显示「正在自动补全」，安装页则按阶段展示
    let repair_status = if silent_when_complete {
        "version.repairingFiles"
    } else {
        "version.downloadingClient"
    };

    if !missing.client.is_empty() {
        reporter.set_status(repair_status);
        // client.jar 体积最大：单文件切块多连接并行，吃满带宽
        for file in &missing.client {
            if let Some(parent) = file.dest.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            download_large_file(
                &state.http_client,
                &file.urls,
                &file.dest,
                file.size,
                &reporter,
            )
            .await?;
        }
    }

    if !missing.libraries.is_empty() {
        reporter.set_status(if silent_when_complete {
            repair_status
        } else {
            "version.downloadingLibraries"
        });
        download_files_concurrent(
            &state.http_client,
            &missing.libraries,
            &reporter,
            DOWNLOAD_CONCURRENCY,
        )
        .await?;
    }

    if !missing.assets.is_empty() {
        reporter.set_status(if silent_when_complete {
            repair_status
        } else {
            "version.downloadingAssets"
        });
        download_files_concurrent(
            &state.http_client,
            &missing.assets,
            &reporter,
            DOWNLOAD_CONCURRENCY,
        )
        .await?;
    }

    if !missing.logging.is_empty() {
        reporter.set_status(if silent_when_complete {
            repair_status
        } else {
            "version.downloadingLogging"
        });
        for file in &missing.logging {
            if let Some(parent) = file.dest.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            download_file_streamed(&state.http_client, &file.urls, &file.dest, &reporter).await?;
        }
    }

    reporter.finish("version.downloadComplete");

    Ok(missing.count())
}

/// 扫描所有预期文件，返回缺失或大小不正确的部分
fn scan_missing_files(
    version: &VersionJson,
    minecraft_dir: &Path,
    version_dir: &Path,
    index: &AssetIndex,
    download_source: &DownloadSource,
) -> MissingFiles {
    let mut missing = MissingFiles::default();

    // client.jar
    let client_dest = version_dir.join(format!("{}.jar", version.id));
    if needs_download(&client_dest, version.downloads.client.size) {
        missing.client.push(PlannedFile {
            urls: crate::utils::url::resolve_download_urls(
                &version.downloads.client.url,
                download_source,
            ),
            dest: client_dest,
            size: version.downloads.client.size,
        });
    }

    // 依赖库（普通 artifact + 当前平台 native）
    let libraries_dir = minecraft_dir.join("libraries");
    for lib in &version.libraries {
        if !should_download_library(lib) {
            continue;
        }

        if let Some(artifact) = lib.downloads.as_ref().and_then(|d| d.artifact.as_ref()) {
            let lib_path = artifact
                .path
                .clone()
                .unwrap_or_else(|| derive_library_path(&lib.name));
            let dest = libraries_dir.join(lib_path);
            if needs_download(&dest, artifact.size) {
                missing.libraries.push(PlannedFile {
                    urls: crate::utils::url::resolve_download_urls(&artifact.url, download_source),
                    dest,
                    size: artifact.size,
                });
            }
        } else if let Some(base_url) = lib.url.as_deref().filter(|url| !url.trim().is_empty()) {
            // 旧版 Forge 只提供 maven 根地址（如 https://maven.minecraftforge.net/）
            let lib_path = derive_library_path(&lib.name);
            let dest = libraries_dir.join(&lib_path);
            if needs_download(&dest, 0) {
                let mut url = base_url.to_string();
                if !url.ends_with('/') {
                    url.push('/');
                }
                url.push_str(&lib_path);
                missing.libraries.push(PlannedFile {
                    urls: vec![url],
                    dest,
                    size: 0,
                });
            }
        }

        if let Some(classifier_key) = get_native_classifier(lib) {
            if let Some(artifact) = lib
                .downloads
                .as_ref()
                .and_then(|d| d.classifiers.as_ref())
                .and_then(|c| c.get(&classifier_key))
            {
                let native_path = artifact.path.clone().unwrap_or_else(|| {
                    // org.lwjgl:lwjgl:3.3.2:natives-windows → org/lwjgl/lwjgl/3.3.2/lwjgl-3.3.2-natives-windows.jar
                    format!(
                        "{}-{}",
                        derive_library_path(&lib.name).replace(".jar", ""),
                        classifier_key
                    )
                });
                let dest = libraries_dir.join(native_path);
                if needs_download(&dest, artifact.size) {
                    missing.libraries.push(PlannedFile {
                        urls: crate::utils::url::resolve_download_urls(
                            &artifact.url,
                            download_source,
                        ),
                        dest,
                        size: artifact.size,
                    });
                }
            }
        }
    }

    // 资源对象
    let objects_dir = minecraft_dir.join("assets").join("objects");
    for object in index.objects.values() {
        let hash = object.hash.as_str();
        if hash.len() < 2 {
            continue;
        }
        let prefix = &hash[..2];
        let dest = objects_dir.join(prefix).join(hash);
        if needs_download(&dest, object.size) {
            missing.assets.push(PlannedFile {
                urls: crate::utils::url::resolve_download_urls(
                    &format!("https://resources.download.minecraft.net/{}/{}", prefix, hash),
                    download_source,
                ),
                dest,
                size: object.size,
            });
        }
    }

    // 日志配置
    if let Some(logging) = &version.logging {
        let dest = minecraft_dir
            .join("assets")
            .join("log_configs")
            .join(&logging.client.file.id);
        if needs_download(&dest, logging.client.file.size) {
            missing.logging.push(PlannedFile {
                urls: crate::utils::url::resolve_download_urls(
                    &logging.client.file.url,
                    download_source,
                ),
                dest,
                size: logging.client.file.size,
            });
        }
    }

    missing
}

/// 并发下载一组文件，用信号量限制并发数
async fn download_files_concurrent(
    client: &reqwest::Client,
    files: &[PlannedFile],
    reporter: &Arc<ProgressReporter>,
    concurrency: usize,
) -> Result<(), I18nError> {
    let semaphore = Arc::new(Semaphore::new(concurrency.max(1)));
    let mut tasks = Vec::with_capacity(files.len());

    for file in files {
        if reporter.is_cancelled() {
            return Err(cancelled_error());
        }
        let permit = semaphore.clone().acquire_owned().await.map_err(|e| {
            I18nError::new("errors.version.downloadFailed")
                .param("url", file.urls.first().map(String::as_str).unwrap_or(""))
                .param("detail", e.to_string())
        })?;

        let client = client.clone();
        let reporter = reporter.clone();
        let urls = file.urls.clone();
        let dest = file.dest.clone();

        tasks.push(tokio::spawn(async move {
            let _permit = permit;
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            download_file_streamed(&client, &urls, &dest, &reporter).await
        }));
    }

    for task in tasks {
        match task.await {
            Ok(Ok(())) => {}
            Ok(Err(err)) => return Err(err),
            Err(err) => {
                return Err(I18nError::new("errors.version.downloadFailed")
                    .param("url", "asset")
                    .param("detail", err.to_string()));
            }
        }
    }

    Ok(())
}

/// 多源尝试 + 重试的单流下载：一个源失败自动切下一个源
async fn download_file_streamed(
    client: &reqwest::Client,
    urls: &[String],
    dest: &Path,
    reporter: &Arc<ProgressReporter>,
) -> Result<(), I18nError> {
    let mut last_error = None;
    for url in urls {
        for attempt in 0..RETRY_TIMES {
            if reporter.is_cancelled() {
                return Err(cancelled_error());
            }
            match stream_to_file(client, url, dest, reporter).await {
                Ok(()) => return Ok(()),
                Err(err) => {
                    last_error = Some(err);
                    if attempt + 1 < RETRY_TIMES {
                        tokio::time::sleep(Duration::from_millis(300 + attempt as u64 * 400)).await;
                    }
                }
            }
        }
    }
    Err(last_error.unwrap_or_else(|| {
        I18nError::new("errors.version.downloadFailed")
            .param("url", "")
            .param("detail", "no available url")
    }))
}

/// 单次流式写入，失败时回滚本轮已上报的字节
async fn stream_to_file(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    reporter: &Arc<ProgressReporter>,
) -> Result<(), I18nError> {
    let response = client.get(url).send().await.map_err(|e| {
        I18nError::new("errors.version.downloadFailed")
            .param("url", url)
            .param("detail", e.to_string())
    })?;

    if !response.status().is_success() {
        return Err(I18nError::new("errors.version.downloadHttpFailed")
            .param("url", url)
            .param("status", response.status().to_string()));
    }

    let mut file = std::fs::File::create(dest).map_err(|e| {
        I18nError::new("errors.version.writeFileFailed")
            .param("path", dest.display().to_string())
            .param("detail", e.to_string())
    })?;

    let mut written = 0u64;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if reporter.is_cancelled() {
            reporter.rollback(written);
            return Err(cancelled_error());
        }
        let chunk = match chunk {
            Ok(chunk) => chunk,
            Err(e) => {
                reporter.rollback(written);
                return Err(I18nError::new("errors.version.readResponseFailed")
                    .param("url", url)
                    .param("detail", e.to_string()));
            }
        };
        if let Err(e) = file.write_all(&chunk) {
            reporter.rollback(written);
            return Err(I18nError::new("errors.version.writeFileFailed")
                .param("path", dest.display().to_string())
                .param("detail", e.to_string()));
        }
        written += chunk.len() as u64;
        reporter.add(chunk.len() as u64);
    }

    Ok(())
}

/// 大文件下载：优先使用 HTTP Range 多连接分块，吃满带宽；失败自动回退单流
async fn download_large_file(
    client: &reqwest::Client,
    urls: &[String],
    dest: &Path,
    size: u64,
    reporter: &Arc<ProgressReporter>,
) -> Result<(), I18nError> {
    if size < CHUNK_ENABLE_SIZE || urls.is_empty() {
        return download_file_streamed(client, urls, dest, reporter).await;
    }
    if reporter.is_cancelled() {
        return Err(cancelled_error());
    }

    for url in urls {
        // 先探测服务器是否支持 Range，不支持就换源或走单流
        let supports_range = matches!(
            client
                .get(url)
                .header(reqwest::header::RANGE, "bytes=0-0")
                .send()
                .await,
            Ok(response) if response.status() == reqwest::StatusCode::PARTIAL_CONTENT
        );
        if !supports_range {
            continue;
        }

        let before = reporter.current();
        match download_in_chunks(client, url, dest, size, reporter).await {
            Ok(()) => return Ok(()),
            Err(err) => {
                let after = reporter.current();
                reporter.rollback(after.saturating_sub(before));
                cleanup_parts(dest);
                log::warn!("分块下载失败，尝试其他源 ({}): {}", url, err);
                if reporter.is_cancelled() {
                    return Err(cancelled_error());
                }
            }
        }
    }

    // 分块全部不可用时兜底单流
    download_file_streamed(client, urls, dest, reporter).await
}

/// 按 Range 切块并行下载，完成后本地拼接
async fn download_in_chunks(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    size: u64,
    reporter: &Arc<ProgressReporter>,
) -> Result<(), I18nError> {
    let chunk_count = ((size + CHUNK_MIN_SIZE - 1) / CHUNK_MIN_SIZE)
        .clamp(1, CHUNK_COUNT_MAX as u64) as usize;
    let chunk_size = size / chunk_count as u64;
    let mut set = JoinSet::new();

    for index in 0..chunk_count {
        let start = index as u64 * chunk_size;
        let end = if index + 1 == chunk_count {
            size - 1
        } else {
            start + chunk_size - 1
        };
        let client = client.clone();
        let url = url.to_string();
        let part = part_path(dest, index);
        let reporter = reporter.clone();

        set.spawn(async move {
            download_chunk(&client, &url, &part, start, end, &reporter).await
        });
    }

    while let Some(result) = set.join_next().await {
        match result {
            Ok(Ok(())) => {}
            Ok(Err(err)) => {
                set.abort_all();
                return Err(err);
            }
            Err(err) => {
                set.abort_all();
                return Err(I18nError::new("errors.version.downloadFailed")
                    .param("url", url)
                    .param("detail", err.to_string()));
            }
        }
    }

    merge_parts(dest, chunk_count).map_err(|e| {
        I18nError::new("errors.version.writeFileFailed")
            .param("path", dest.display().to_string())
            .param("detail", e.to_string())
    })
}

/// 下载单个分块，失败重试
async fn download_chunk(
    client: &reqwest::Client,
    url: &str,
    part: &Path,
    start: u64,
    end: u64,
    reporter: &Arc<ProgressReporter>,
) -> Result<(), I18nError> {
    let mut last_error = None;
    for attempt in 0..RETRY_TIMES {
        if reporter.is_cancelled() {
            return Err(cancelled_error());
        }
        match stream_range_to_file(client, url, part, start, end, reporter).await {
            Ok(()) => return Ok(()),
            Err(err) => {
                last_error = Some(err);
                if attempt + 1 < RETRY_TIMES {
                    tokio::time::sleep(Duration::from_millis(300)).await;
                }
            }
        }
    }
    Err(last_error.unwrap_or_else(|| {
        I18nError::new("errors.version.downloadFailed")
            .param("url", url)
            .param("detail", "chunk failed")
    }))
}

async fn stream_range_to_file(
    client: &reqwest::Client,
    url: &str,
    part: &Path,
    start: u64,
    end: u64,
    reporter: &Arc<ProgressReporter>,
) -> Result<(), I18nError> {
    let expected = end - start + 1;
    let response = client
        .get(url)
        .header(reqwest::header::RANGE, format!("bytes={}-{}", start, end))
        .send()
        .await
        .map_err(|e| {
            I18nError::new("errors.version.downloadFailed")
                .param("url", url)
                .param("detail", e.to_string())
        })?;

    if response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
        return Err(I18nError::new("errors.version.downloadHttpFailed")
            .param("url", url)
            .param("status", response.status().to_string()));
    }

    let mut file = std::fs::File::create(part).map_err(|e| {
        I18nError::new("errors.version.writeFileFailed")
            .param("path", part.display().to_string())
            .param("detail", e.to_string())
    })?;

    let mut written = 0u64;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if reporter.is_cancelled() {
            reporter.rollback(written);
            return Err(cancelled_error());
        }
        let chunk = match chunk {
            Ok(chunk) => chunk,
            Err(e) => {
                reporter.rollback(written);
                return Err(I18nError::new("errors.version.readResponseFailed")
                    .param("url", url)
                    .param("detail", e.to_string()));
            }
        };
        if let Err(e) = file.write_all(&chunk) {
            reporter.rollback(written);
            return Err(I18nError::new("errors.version.writeFileFailed")
                .param("path", part.display().to_string())
                .param("detail", e.to_string()));
        }
        written += chunk.len() as u64;
        reporter.add(chunk.len() as u64);
    }

    if written != expected {
        reporter.rollback(written);
        return Err(I18nError::new("errors.version.readResponseFailed")
            .param("url", url)
            .param("detail", format!("expected {} bytes, got {}", expected, written)));
    }

    Ok(())
}

/// 把分块临时文件按顺序拼接成完整文件
fn merge_parts(dest: &Path, count: usize) -> std::io::Result<()> {
    let mut output = std::fs::File::create(dest)?;
    for index in 0..count {
        let part = part_path(dest, index);
        let mut input = std::fs::File::open(&part)?;
        std::io::copy(&mut input, &mut output)?;
    }
    output.flush()?;
    drop(output);

    for index in 0..count {
        std::fs::remove_file(part_path(dest, index)).ok();
    }
    Ok(())
}

fn part_path(dest: &Path, index: usize) -> PathBuf {
    let name = dest
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "download".to_string());
    dest.with_file_name(format!("{}.part{}", name, index))
}

fn cleanup_parts(dest: &Path) {
    for index in 0..CHUNK_COUNT_MAX {
        std::fs::remove_file(part_path(dest, index)).ok();
    }
}

/// 判断文件是否需要下载：不存在、为空或大小与预期不符都视为不完整
fn needs_download(path: &Path, expected_size: u64) -> bool {
    match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => {
            if metadata.len() == 0 {
                true
            } else if expected_size > 0 {
                metadata.len() != expected_size
            } else {
                false
            }
        }
        _ => true,
    }
}

/// 下载小型元数据文件（多源尝试）
async fn download_file(
    client: &reqwest::Client,
    urls: &[String],
    dest: &Path,
) -> Result<(), I18nError> {
    let mut last_error = None;
    for url in urls {
        let outcome = match client.get(url).send().await {
            Ok(response) if response.status().is_success() => match response.bytes().await {
                Ok(bytes) => std::fs::write(dest, &bytes).map_err(|e| {
                    I18nError::new("errors.version.writeFileFailed")
                        .param("path", dest.display().to_string())
                        .param("detail", e.to_string())
                }),
                Err(e) => Err(I18nError::new("errors.version.readResponseFailed")
                    .param("url", url)
                    .param("detail", e.to_string())),
            },
            Ok(response) => Err(I18nError::new("errors.version.downloadHttpFailed")
                .param("url", url)
                .param("status", response.status().to_string())),
            Err(e) => Err(I18nError::new("errors.version.downloadFailed")
                .param("url", url)
                .param("detail", e.to_string())),
        };

        match outcome {
            Ok(()) => return Ok(()),
            Err(err) => last_error = Some(err),
        }
    }

    Err(last_error.unwrap_or_else(|| {
        I18nError::new("errors.version.downloadFailed")
            .param("url", "")
            .param("detail", "no available url")
    }))
}

/// 根据当前平台返回应下载的 native classifier 键
fn get_native_classifier(lib: &Library) -> Option<String> {
    let natives = lib.natives.as_ref()?;
    let current_os = std::env::consts::OS;
    let key = match current_os {
        "windows" => natives.get("windows"),
        "macos" => natives.get("osx").or_else(|| natives.get("macos")),
        "linux" => natives.get("linux"),
        _ => None,
    };
    key.cloned()
}

/// 判断是否应该下载该 library（根据 rules 过滤 OS 兼容性）
/// 规则处理逻辑：依次应用所有匹配当前平台的规则，最后一条匹配规则决定结果；无规则时默认允许
fn should_download_library(lib: &Library) -> bool {
    let Some(rules) = &lib.rules else {
        return true;
    };

    let current_os = std::env::consts::OS;
    let mut allowed = true;

    for rule in rules {
        let applies = match &rule.os {
            Some(os_rule) => match &os_rule.name {
                Some(name) => match name.as_str() {
                    "windows" => current_os == "windows",
                    "macos" | "osx" => current_os == "macos",
                    "linux" => current_os == "linux",
                    _ => true,
                },
                None => true,
            },
            None => true,
        };

        if applies {
            allowed = rule.action == "allow";
        }
    }

    allowed
}

/// 将 Maven 坐标推导为 libraries 目录下的相对路径
fn derive_library_path(name: &str) -> String {
    // com.mojang:logging:1.1.1 → com/mojang/logging/1.1.1/logging-1.1.1.jar
    // group:artifact:version:classifier → .../artifact-version-classifier.jar
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() >= 3 {
        let group = parts[0].replace('.', "/");
        let artifact = parts[1];
        let version = parts[2];
        let file = match parts.get(3) {
            Some(classifier) => format!("{}-{}-{}.jar", artifact, version, classifier),
            None => format!("{}-{}.jar", artifact, version),
        };
        format!("{}/{}/{}/{}", group, artifact, version, file)
    } else {
        format!("{}.jar", name.replace(':', "/"))
    }
}
