use crate::i18n::I18nError;
use crate::i18n_err;
use crate::state::app_state::AppState;
use futures_util::StreamExt;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

/// 更新包下载进度事件
#[derive(Clone, Serialize)]
struct UpdateProgress {
    downloaded: u64,
    total: u64,
}

/// 允许下载更新的站点，避免被传入任意地址
const ALLOWED_HOSTS: [&str; 4] = [
    "gitee.com",
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
];

/// 更新包最小体积，用于排除下到的错误页面
const MIN_PACKAGE_SIZE: u64 = 8 * 1024 * 1024;

fn update_temp_dir() -> PathBuf {
    std::env::temp_dir().join("LanyouLauncherUpdate")
}

/// 校验更新地址只来自受信任的代码托管平台
fn validate_url(download_url: &str) -> Result<(), I18nError> {
    let parsed = url::Url::parse(download_url)
        .map_err(|e| i18n_err!("errors.update.unsafeSource", e))?;
    let host = parsed.host_str().unwrap_or("");

    if parsed.scheme() != "https" || !ALLOWED_HOSTS.contains(&host) {
        return Err(I18nError::new("errors.update.unsafeSource")
            .param("detail", download_url));
    }

    Ok(())
}

/// 下载新的启动器可执行文件，并在下载过程中推送进度
async fn download_package(
    state: &AppState,
    app: &AppHandle,
    download_url: &str,
) -> Result<PathBuf, I18nError> {
    let dir = update_temp_dir();
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| i18n_err!("errors.update.downloadFailed", e))?;
    let target = dir.join("lanyou-launcher-new.exe");

    let response = state
        .http_client
        .get(download_url)
        .header("User-Agent", "LanyouLauncher")
        .send()
        .await
        .map_err(|e| i18n_err!("errors.update.downloadFailed", e))?;

    if !response.status().is_success() {
        return Err(I18nError::new("errors.update.checkHttpFailed")
            .param("status", response.status().to_string())
            .param("url", download_url));
    }

    let total = response.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(&target)
        .await
        .map_err(|e| i18n_err!("errors.update.downloadFailed", e))?;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| i18n_err!("errors.update.downloadFailed", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| i18n_err!("errors.update.downloadFailed", e))?;
        downloaded += chunk.len() as u64;

        if last_emit.elapsed() >= Duration::from_millis(200) {
            let _ = app.emit(
                "update-progress",
                UpdateProgress { downloaded, total },
            );
            last_emit = Instant::now();
        }
    }

    file.flush()
        .await
        .map_err(|e| i18n_err!("errors.update.downloadFailed", e))?;

    let _ = app.emit(
        "update-progress",
        UpdateProgress { downloaded, total },
    );

    if downloaded < MIN_PACKAGE_SIZE {
        let _ = tokio::fs::remove_file(&target).await;
        return Err(I18nError::new("errors.update.downloadFailed")
            .param("detail", "downloaded package is too small"));
    }

    // 校验 PE 头，避免把错误页当成可执行文件
    let header = tokio::fs::read(&target)
        .await
        .map_err(|e| i18n_err!("errors.update.downloadFailed", e))?;
    if !header.starts_with(b"MZ") {
        let _ = tokio::fs::remove_file(&target).await;
        return Err(I18nError::new("errors.update.downloadFailed")
            .param("detail", "downloaded file is not a windows executable"));
    }

    Ok(target)
}

/// 转义 PowerShell 单引号字符串
fn ps_quote(path: &Path) -> String {
    format!("'{}'", path.display().to_string().replace('\'', "''"))
}

/// 写入更新辅助脚本：等待当前进程退出后替换可执行文件并重新启动
fn write_helper_script(package: &Path, target: &Path) -> Result<PathBuf, I18nError> {
    let script_path = update_temp_dir().join("apply-update.ps1");
    let pid = std::process::id();
    let content = format!(
        "\u{feff}$ErrorActionPreference = 'SilentlyContinue'\n\
$pidToWait = {pid}\n\
while (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) {{ Start-Sleep -Milliseconds 300 }}\n\
Start-Sleep -Milliseconds 400\n\
$ok = $false\n\
for ($i = 0; $i -lt 40; $i++) {{\n\
  try {{ Copy-Item -LiteralPath {package} -Destination {target} -Force -ErrorAction Stop; $ok = $true; break }} catch {{ Start-Sleep -Milliseconds 500 }}\n\
}}\n\
if ($ok) {{ Start-Process -FilePath {target} }}\n\
Remove-Item -LiteralPath $PSCommandPath -Force\n",
        pid = pid,
        package = ps_quote(package),
        target = ps_quote(target),
    );

    std::fs::write(&script_path, content)
        .map_err(|e| i18n_err!("errors.update.installFailed", e))?;
    Ok(script_path)
}

/// 启动隐藏的 PowerShell 辅助进程执行替换
fn spawn_helper(script: &Path) -> Result<(), I18nError> {
    let mut command = std::process::Command::new("powershell");
    command.args([
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-File",
        &script.display().to_string(),
    ]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW：避免更新时闪出控制台窗口
        command.creation_flags(0x0800_0000);
    }

    command
        .spawn()
        .map_err(|e| i18n_err!("errors.update.installFailed", e))?;
    Ok(())
}

/// 下载更新、启动替换脚本，然后退出当前进程
pub async fn start_self_update(
    state: &AppState,
    app: &AppHandle,
    download_url: &str,
) -> Result<(), I18nError> {
    validate_url(download_url)?;

    let package = download_package(state, app, download_url).await?;
    let target = std::env::current_exe()
        .map_err(|e| i18n_err!("errors.update.installFailed", e))?;
    let script = write_helper_script(&package, &target)?;
    spawn_helper(&script)?;

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(500)).await;
        handle.exit(0);
    });

    Ok(())
}
