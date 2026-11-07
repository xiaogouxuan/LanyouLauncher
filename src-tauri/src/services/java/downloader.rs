use crate::i18n::I18nError;
use crate::i18n_err;
use crate::state::app_state::AppState;
use futures_util::StreamExt;
use std::path::{Path, PathBuf};
use tauri::Emitter;

/// 当前平台架构标识，用于 Adoptium API
struct PlatformArch {
    os: &'static str,
    arch: &'static str,
    ext: &'static str,
}

/// 根据当前操作系统和 CPU 架构生成 Adoptium 下载参数
fn current_platform() -> Result<PlatformArch, I18nError> {
    let os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "mac"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        return Err(i18n_err!("errors.java.unsupportedPlatform"));
    };

    let arch = if cfg!(target_arch = "x86_64") {
        "x64"
    } else if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        return Err(i18n_err!("errors.java.unsupportedPlatform"));
    };

    let ext = if cfg!(target_os = "windows") { "zip" } else { "tar.gz" };

    Ok(PlatformArch { os, arch, ext })
}

/// 调用 Adoptium API 获取指定主版本 JDK 的下载链接
async fn get_adoptium_download_url(
    state: &AppState,
    major: u32,
) -> Result<String, I18nError> {
    let platform = current_platform()?;
    let url = format!(
        "https://api.adoptium.net/v3/binary/latest/{}/ga/{}/{}/jdk/hotspot/normal/eclipse?project=jdk",
        major, platform.os, platform.arch
    );

    // Adoptium 该接口会返回 307 重定向到真实下载地址，先跟随重定向拿到最终 URL
    let response = state
        .http_client
        .get(&url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.java.downloadFailed", e))?;

    if !response.status().is_success() && response.status() != reqwest::StatusCode::TEMPORARY_REDIRECT && response.status() != reqwest::StatusCode::PERMANENT_REDIRECT {
        return Err(
            I18nError::new("errors.java.downloadFailed")
                .param("status", response.status().to_string()),
        );
    }

    response
        .url()
        .to_string()
        .parse()
        .map_err(|_| i18n_err!("errors.java.downloadFailed", "invalid url"))
}

/// 下载 Java 运行时并解压到启动器目录，返回解压后的 Java 可执行文件路径
pub async fn download_java(
    state: &AppState,
    app_handle: &tauri::AppHandle,
    major: u32,
) -> Result<String, I18nError> {
    let platform = current_platform()?;

    let java_dir = state.launcher_dir.join("java");
    let downloads_dir = java_dir.join("downloads");
    let extract_dir = java_dir.join(format!("adoptium-{}", major));

    std::fs::create_dir_all(&downloads_dir)
        .map_err(|e| i18n_err!("errors.file.createDirFailed", e))?;
    std::fs::create_dir_all(&extract_dir)
        .map_err(|e| i18n_err!("errors.file.createDirFailed", e))?;

    let download_url = get_adoptium_download_url(state, major).await?;
    let file_name = format!("adoptium-{}-{}-{}.{}", major, platform.os, platform.arch, platform.ext);
    let archive_path = downloads_dir.join(&file_name);

    emit_progress(app_handle, "settings.downloadingJava", 0, 100);

    let response = state
        .http_client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.java.downloadFailed", e))?;

    if !response.status().is_success() {
        return Err(
            I18nError::new("errors.java.downloadFailed")
                .param("status", response.status().to_string()),
        );
    }

    let total = response
        .content_length()
        .unwrap_or(0);

    // 流式下载并汇报进度
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut file = std::fs::File::create(&archive_path)
        .map_err(|e| i18n_err!("errors.java.downloadFailed", e))?;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| i18n_err!("errors.java.downloadFailed", e))?;
        std::io::Write::write_all(&mut file, &chunk)
            .map_err(|e| i18n_err!("errors.java.downloadFailed", e))?;
        downloaded += chunk.len() as u64;
        if total > 0 {
            let percent = (downloaded * 100 / total) as u32;
            emit_progress(app_handle, "settings.downloadingJava", percent, 100);
        }
    }

    emit_progress(app_handle, "settings.downloadingJava", 100, 100);

    // 清理旧解压目录内容，避免版本混淆
    if extract_dir.exists() {
        let _ = std::fs::remove_dir_all(&extract_dir);
    }
    std::fs::create_dir_all(&extract_dir)
        .map_err(|e| i18n_err!("errors.file.createDirFailed", e))?;

    extract_archive(&archive_path, &extract_dir)
        .map_err(|e| i18n_err!("errors.java.extractFailed", e))?;

    // 在解压目录中查找 java 可执行文件
    let java_exe = find_java_executable(&extract_dir)
        .ok_or(i18n_err!("errors.java.notFound"))?;

    // 刷新 settings.java_paths
    refresh_java_paths(state, &java_exe)?;

    Ok(java_exe.to_string_lossy().to_string())
}

/// 解压 JDK 归档文件
fn extract_archive(archive_path: &Path, dest: &Path) -> Result<(), std::io::Error> {
    if archive_path.extension().and_then(|s| s.to_str()) == Some("zip")
        || archive_path.to_string_lossy().ends_with(".zip")
    {
        extract_zip(archive_path, dest)
    } else {
        extract_tar_gz(archive_path, dest)
    }
}

/// 解压 zip 文件
fn extract_zip(archive_path: &Path, dest: &Path) -> Result<(), std::io::Error> {
    let file = std::fs::File::open(archive_path)?;
    let reader = std::io::BufReader::new(file);
    let mut archive = zip::ZipArchive::new(reader)?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let name = file.name();
        let out_path = dest.join(name);

        if name.ends_with('/') {
            std::fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut out_file = std::fs::File::create(&out_path)?;
            std::io::copy(&mut file, &mut out_file)?;
        }
    }

    Ok(())
}

/// 解压 tar.gz 文件
fn extract_tar_gz(archive_path: &Path, dest: &Path) -> Result<(), std::io::Error> {
    let file = std::fs::File::open(archive_path)?;
    let decoder = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(decoder);
    archive.unpack(dest)?;
    Ok(())
}

/// 在解压目录中查找 java 可执行文件（优先 javaw.exe，回退 java.exe/java）
fn find_java_executable(dir: &Path) -> Option<PathBuf> {
    let primary_name = if cfg!(target_os = "windows") {
        "javaw.exe"
    } else {
        "java"
    };
    let fallback_name = if cfg!(target_os = "windows") {
        "java.exe"
    } else {
        "java"
    };

    find_java_executable_recursive(dir, primary_name, fallback_name, 0)
}

fn find_java_executable_recursive(
    dir: &Path,
    primary_name: &str,
    fallback_name: &str,
    depth: usize,
) -> Option<PathBuf> {
    if depth > 3 {
        return None;
    }

    let mut fallback: Option<PathBuf> = None;

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(found) =
                    find_java_executable_recursive(&path, primary_name, fallback_name, depth + 1)
                {
                    return Some(found);
                }
            } else if path.is_file() {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if name.eq_ignore_ascii_case(primary_name) {
                    return Some(path);
                }
                if fallback.is_none() && name.eq_ignore_ascii_case(fallback_name) {
                    fallback = Some(path);
                }
            }
        }
    }

    fallback
}

/// 将新 Java 路径添加到 settings.java_paths 并保存
fn refresh_java_paths(state: &AppState, java_exe: &Path) -> Result<(), I18nError> {
    let settings_file = crate::utils::paths::get_settings_file(&state.launcher_dir);
    let mut settings: crate::models::settings::Settings = if settings_file.exists() {
        std::fs::read_to_string(&settings_file)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_default()
    } else {
        crate::models::settings::Settings::default()
    };

    let path_str = java_exe.to_string_lossy().to_string();
    if !settings.java_paths.contains(&path_str) {
        settings.java_paths.push(path_str);
    }

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| i18n_err!("errors.settings.serializeFailed", e))?;
    std::fs::write(&settings_file, content)
        .map_err(|e| i18n_err!("errors.settings.writeFileFailed", e))?;

    Ok(())
}

/// 发送下载进度事件到前端
fn emit_progress(app_handle: &tauri::AppHandle, status: &str, current: u32, total: u32) {
    let _ = app_handle.emit(
        "download-progress",
        crate::models::version::DownloadProgress {
            id: format!("java-{}", status),
            task_type: "java_download".to_string(),
            total: total as u64,
            current: current as u64,
            status: status.to_string(),
            speed: None,
            stage: None,
        },
    );
}
