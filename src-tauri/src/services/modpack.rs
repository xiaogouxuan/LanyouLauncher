// Deserialization-only fields
#![allow(dead_code)]

use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::settings::{DownloadSource, Settings};
use crate::models::version::{LoaderType, VersionMeta};
use crate::state::app_state::AppState;
use serde::Deserialize;
use serde::Serialize;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use tauri::Emitter;
use zip::ZipArchive;

const IMPORT_EVENT: &str = "modpack-import-progress";
const CURSEFORGE_API: &str = "https://api.curseforge.com/v1";
const DOWNLOAD_CONCURRENCY: usize = 8;

/// 整合包导入结果，前端用于刷新版本列表并自动选中
#[derive(Debug, Serialize)]
pub struct ImportedModpack {
    pub version_id: String,
    pub name: String,
    pub game_version: String,
    pub loader: Option<String>,
    pub loader_version: Option<String>,
    pub mods_installed: u32,
    pub mods_failed: u32,
}

#[derive(Debug, Serialize, Clone)]
struct ImportProgress {
    stage: String,
    current: u64,
    total: u64,
    message: String,
}

/// 支持的整合包格式
#[derive(Debug, Clone, Copy, PartialEq)]
enum PackFormat {
    Auto,
    CurseForge,
    Modrinth,
    Lanyou,
}

impl PackFormat {
    fn parse(value: &str) -> Self {
        match value.to_lowercase().as_str() {
            "curseforge" => PackFormat::CurseForge,
            "modrinth" => PackFormat::Modrinth,
            "lanyou" => PackFormat::Lanyou,
            _ => PackFormat::Auto,
        }
    }
}

/// 待下载的整合包文件
enum PendingDownload {
    /// Modrinth：直接给出下载地址与实例内的相对路径
    Url { urls: Vec<String>, rel_path: String },
    /// CurseForge：只有项目/文件 ID，需要再查一次文件信息
    CurseForge { file_id: u64, required: bool },
}

struct PackMeta {
    name: String,
    game_version: String,
    loader: Option<LoaderType>,
    loader_version: Option<String>,
    /// 自有格式：zip 内的版本目录名
    lanyou_source_id: Option<String>,
    downloads: Vec<PendingDownload>,
}

#[derive(Deserialize)]
struct MrpackIndex {
    name: Option<String>,
    #[serde(default)]
    dependencies: std::collections::HashMap<String, String>,
    #[serde(default)]
    files: Vec<MrpackFile>,
}

#[derive(Deserialize)]
struct MrpackFile {
    path: String,
    #[serde(default)]
    downloads: Vec<String>,
    #[serde(default)]
    env: std::collections::HashMap<String, String>,
}

#[derive(Deserialize)]
struct CurseForgeManifest {
    name: Option<String>,
    minecraft: CurseForgeMinecraft,
    #[serde(default)]
    files: Vec<CurseForgeManifestFile>,
}

#[derive(Deserialize)]
struct CurseForgeMinecraft {
    version: String,
    #[serde(default, rename = "modLoaders")]
    mod_loaders: Vec<CurseForgeModLoader>,
}

#[derive(Deserialize)]
struct CurseForgeModLoader {
    id: String,
    #[serde(default)]
    primary: bool,
}

#[derive(Deserialize)]
struct CurseForgeManifestFile {
    #[serde(rename = "projectID")]
    project_id: u64,
    #[serde(rename = "fileID")]
    file_id: u64,
    #[serde(default)]
    required: bool,
}

#[derive(Deserialize)]
struct CurseForgeFilesResponse {
    data: Vec<CurseForgeFileInfo>,
}

#[derive(Deserialize)]
struct CurseForgeFileInfo {
    id: u64,
    #[serde(rename = "fileName")]
    file_name: String,
    #[serde(rename = "downloadUrl")]
    download_url: Option<String>,
}

/// 导入整合包
///
/// - `path`：整合包 zip / mrpack 路径
/// - `format`：auto（推荐）/ curseforge / modrinth / lanyou
pub async fn import_modpack(
    state: &AppState,
    app: &tauri::AppHandle,
    path: &str,
    format: &str,
) -> Result<ImportedModpack, I18nError> {
    let archive_path = PathBuf::from(path);
    if !archive_path.is_file() {
        return Err(i18n_err!("errors.modpack.fileNotFound", path));
    }

    emit_progress(app, "prepare", 0, 1, "");

    // 1. 识别格式并读取整合包信息（纯读操作，异步下载前完成）
    let meta = read_pack_meta(&archive_path, PackFormat::parse(format))?;

    // 2. 确保原版版本可用（缺失时自动下载，不需要用户手动处理）
    ensure_game_version(state, app, &meta.game_version).await?;

    // 3. 确保加载器可用，并拿到加载器派生版本目录
    let loader_version_id = ensure_loader(state, app, &meta).await?;

    // 4. 创建独立实例目录
    let version_id = allocate_version_id(&state.minecraft_dir, &meta.name);
    let versions_dir = crate::utils::paths::get_versions_dir(&state.minecraft_dir);
    let instance_dir = versions_dir.join(&version_id);
    std::fs::create_dir_all(&instance_dir)
        .map_err(|e| i18n_err!("errors.file.createDirFailed", e))?;

    write_instance_version_json(
        &state.minecraft_dir,
        &instance_dir,
        &version_id,
        &meta.game_version,
        loader_version_id.as_deref(),
    )?;

    // 隔离实例：mods/saves 都放在 versions/<id> 下，与 HMCL/PCL 一致
    let mut version_meta = VersionMeta {
        is_isolated: true,
        ..Default::default()
    };
    if let (Some(loader), Some(loader_version)) = (&meta.loader, loader_version_id.as_deref()) {
        version_meta.loader_history.insert(loader.clone(), loader_version.to_string());
    }
    crate::services::version::meta::save_version_meta(&state.minecraft_dir, &version_id, &version_meta)
        .map_err(|e| i18n_err!("errors.settings.writeFileFailed", e))?;
    std::fs::create_dir_all(instance_dir.join("mods")).ok();

    // 5. 解压 overrides（整合包自带的配置、资源包、Mod 等）
    emit_progress(app, "extract", 0, 1, "");
    extract_overrides(
        &archive_path,
        &instance_dir,
        &state.minecraft_dir,
        meta.lanyou_source_id.as_deref(),
    )?;

    // 6. 下载整合包声明的 Mod 文件
    let (mods_installed, mods_failed) = download_pack_files(state, app, &instance_dir, &meta.downloads).await?;

    emit_progress(app, "finish", 1, 1, "");

    Ok(ImportedModpack {
        version_id,
        name: meta.name,
        game_version: meta.game_version,
        loader: meta.loader.map(|loader| format!("{:?}", loader)),
        loader_version: meta.loader_version,
        mods_installed,
        mods_failed,
    })
}

fn emit_progress(app: &tauri::AppHandle, stage: &str, current: u64, total: u64, message: &str) {
    let _ = app.emit(
        IMPORT_EVENT,
        ImportProgress {
            stage: stage.to_string(),
            current,
            total,
            message: message.to_string(),
        },
    );
}

/// 读取并校验整合包信息
fn read_pack_meta(archive_path: &Path, requested: PackFormat) -> Result<PackMeta, I18nError> {
    let file = std::fs::File::open(archive_path).map_err(|e| i18n_err!("errors.modpack.openFailed", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| i18n_err!("errors.modpack.invalidZip", e))?;

    let names = collect_entry_names(&mut archive);

    let mut format = requested;
    if format == PackFormat::Auto {
        format = detect_format(&mut archive, &names)
            .ok_or_else(|| i18n_err!("errors.modpack.unsupportedFormat"))?;
    }

    let fallback_name = archive_path
        .file_stem()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("Modpack")
        .to_string();

    match format {
        PackFormat::Modrinth => read_modrinth_meta(&mut archive, &names, &fallback_name),
        PackFormat::CurseForge => read_curseforge_meta(&mut archive, &names, &fallback_name),
        PackFormat::Lanyou => read_lanyou_meta(&mut archive, &names, &fallback_name),
        PackFormat::Auto => Err(i18n_err!("errors.modpack.unsupportedFormat")),
    }
}

/// 收集并规范化 zip 内的条目名
fn collect_entry_names(archive: &mut ZipArchive<std::fs::File>) -> Vec<String> {
    let mut names = Vec::with_capacity(archive.len());
    for index in 0..archive.len() {
        let name = archive
            .by_index(index)
            .map(|entry| normalize_entry(entry.name()))
            .unwrap_or_default();
        names.push(name);
    }
    names
}

fn normalize_entry(name: &str) -> String {
    let name = name.replace('\\', "/");
    name.trim_start_matches("./").to_string()
}

/// 自动识别整合包格式
fn detect_format(
    archive: &mut ZipArchive<std::fs::File>,
    names: &[String],
) -> Option<PackFormat> {
    if names
        .iter()
        .any(|name| name == "modrinth.index.json" || name.ends_with("/modrinth.index.json"))
    {
        return Some(PackFormat::Modrinth);
    }

    // CurseForge：根目录 manifest.json 且 manifestType 为 minecraftModpack
    if let Some(content) = read_entry_text(archive, "manifest.json") {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
            if value.get("manifestType").and_then(|v| v.as_str()) == Some("minecraftModpack") {
                return Some(PackFormat::CurseForge);
            }
            if value.get("launcher").and_then(|v| v.as_str()) == Some("LanyouLauncher")
                || value.get("format").is_some() && value.get("versionId").is_some()
            {
                return Some(PackFormat::Lanyou);
            }
        }
    }

    // 自有格式：<versionId>/manifest.json
    for name in names {
        let Some(prefix) = name.strip_suffix("/manifest.json") else {
            continue;
        };
        if prefix.contains('/') {
            continue;
        }
        let Some(content) = read_entry_text(archive, name) else {
            continue;
        };
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
            if value.get("launcher").and_then(|v| v.as_str()) == Some("LanyouLauncher")
                || value.get("format").is_some() && value.get("versionId").is_some()
            {
                return Some(PackFormat::Lanyou);
            }
        }
    }

    None
}

fn read_entry_text(archive: &mut ZipArchive<std::fs::File>, name: &str) -> Option<String> {
    let normalized = name.replace('\\', "/");
    let mut entry = archive.by_name(&normalized).ok()?;
    let mut content = String::new();
    entry.read_to_string(&mut content).ok()?;
    Some(content)
}

fn read_modrinth_meta(
    archive: &mut ZipArchive<std::fs::File>,
    names: &[String],
    fallback_name: &str,
) -> Result<PackMeta, I18nError> {
    let index_name = names
        .iter()
        .find(|name| name.as_str() == "modrinth.index.json" || name.ends_with("/modrinth.index.json"))
        .cloned()
        .ok_or_else(|| i18n_err!("errors.modpack.unsupportedFormat"))?;

    let content = read_entry_text(archive, &index_name)
        .ok_or_else(|| i18n_err!("errors.modpack.readManifestFailed", index_name.clone()))?;
    let index: MrpackIndex = serde_json::from_str(&content)
        .map_err(|e| i18n_err!("errors.modpack.parseManifestFailed", e))?;

    let game_version = index
        .dependencies
        .get("minecraft")
        .cloned()
        .ok_or_else(|| i18n_err!("errors.modpack.gameVersionMissing", "minecraft"))?;

    let (loader, loader_version) = parse_dependencies(&index.dependencies);

    let downloads = index
        .files
        .into_iter()
        .filter(|file| {
            // 只安装客户端需要的文件
            file.env
                .get("client")
                .map(|env| env != "unsupported")
                .unwrap_or(true)
        })
        .filter(|file| !file.downloads.is_empty() && !file.path.trim().is_empty())
        .map(|file| PendingDownload::Url {
            urls: file.downloads,
            rel_path: file.path,
        })
        .collect();

    Ok(PackMeta {
        name: index
            .name
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| fallback_name.to_string()),
        game_version,
        loader,
        loader_version,
        lanyou_source_id: None,
        downloads,
    })
}

fn parse_dependencies(
    dependencies: &std::collections::HashMap<String, String>,
) -> (Option<LoaderType>, Option<String>) {
    for (key, loader) in [
        ("fabric-loader", LoaderType::Fabric),
        ("quilt-loader", LoaderType::Quilt),
        ("forge", LoaderType::Forge),
        ("neoforge", LoaderType::NeoForge),
    ] {
        if let Some(version) = dependencies.get(key) {
            return (Some(loader), Some(version.clone()));
        }
    }
    (None, None)
}

fn read_curseforge_meta(
    archive: &mut ZipArchive<std::fs::File>,
    _names: &[String],
    fallback_name: &str,
) -> Result<PackMeta, I18nError> {
    let content = read_entry_text(archive, "manifest.json")
        .ok_or_else(|| i18n_err!("errors.modpack.unsupportedFormat"))?;
    let manifest: CurseForgeManifest = serde_json::from_str(&content)
        .map_err(|e| i18n_err!("errors.modpack.parseManifestFailed", e))?;

    let primary = manifest
        .minecraft
        .mod_loaders
        .iter()
        .find(|loader| loader.primary)
        .or_else(|| manifest.minecraft.mod_loaders.first());

    let (loader, loader_version) = primary.map(parse_curseforge_loader).unwrap_or((None, None));

    let downloads = manifest
        .files
        .into_iter()
        .map(|file| PendingDownload::CurseForge {
            file_id: file.file_id,
            required: file.required,
        })
        .collect();

    Ok(PackMeta {
        name: manifest
            .name
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| fallback_name.to_string()),
        game_version: manifest.minecraft.version,
        loader,
        loader_version,
        lanyou_source_id: None,
        downloads,
    })
}

/// CurseForge 的加载器 ID 形如 forge-47.2.0 / fabric-0.15.11 / neoforge-20.4.237
fn parse_curseforge_loader(loader: &CurseForgeModLoader) -> (Option<LoaderType>, Option<String>) {
    let id = loader.id.as_str();
    let (name, version) = id.split_once('-').unwrap_or((id, ""));
    let loader_type = match name.to_lowercase().as_str() {
        "forge" => Some(LoaderType::Forge),
        "fabric" => Some(LoaderType::Fabric),
        "quilt" => Some(LoaderType::Quilt),
        "neoforge" => Some(LoaderType::NeoForge),
        _ => None,
    };
    let version = (!version.is_empty()).then(|| version.to_string());
    (loader_type, version)
}

fn read_lanyou_meta(
    archive: &mut ZipArchive<std::fs::File>,
    names: &[String],
    fallback_name: &str,
) -> Result<PackMeta, I18nError> {
    // 先找 <versionId>/manifest.json，找不到再看根目录 manifest.json
    let mut manifest_entry = names
        .iter()
        .find(|name| {
            name.strip_suffix("/manifest.json")
                .map(|prefix| !prefix.contains('/'))
                .unwrap_or(false)
        })
        .cloned();
    if manifest_entry.is_none() {
        manifest_entry = Some("manifest.json".to_string());
    }
    let manifest_entry = manifest_entry.unwrap();

    let content = read_entry_text(archive, &manifest_entry)
        .ok_or_else(|| i18n_err!("errors.modpack.readManifestFailed", manifest_entry.clone()))?;
    let value: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| i18n_err!("errors.modpack.parseManifestFailed", e))?;

    let source_id = value
        .get("versionId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            manifest_entry
                .strip_suffix("/manifest.json")
                .map(|prefix| prefix.to_string())
        })
        .unwrap_or_else(|| fallback_name.to_string());

    let game_version = value
        .get("baseVersion")
        .and_then(|v| v.as_str())
        .filter(|v| !v.is_empty())
        .or_else(|| value.get("gameVersion").and_then(|v| v.as_str()))
        .map(normalize_game_version)
        .ok_or_else(|| i18n_err!("errors.modpack.gameVersionMissing", "gameVersion"))?;

    let loader = value
        .get("loader")
        .and_then(|v| v.as_str())
        .and_then(|loader| match loader.to_lowercase().as_str() {
            "forge" => Some(LoaderType::Forge),
            "fabric" => Some(LoaderType::Fabric),
            "quilt" => Some(LoaderType::Quilt),
            "neoforge" => Some(LoaderType::NeoForge),
            _ => None,
        });
    let loader_version = value
        .get("loaderVersion")
        .and_then(|v| v.as_str())
        .filter(|v| !v.is_empty())
        .map(|v| v.to_string());

    Ok(PackMeta {
        name: value
            .get("name")
            .and_then(|v| v.as_str())
            .filter(|v| !v.trim().is_empty())
            .map(|v| v.to_string())
            .unwrap_or_else(|| fallback_name.to_string()),
        game_version,
        loader,
        loader_version,
        lanyou_source_id: Some(source_id),
        downloads: Vec::new(),
    })
}

/// 兼容旧版导出的清单：当时 gameVersion 记录的是加载器版本目录名
fn normalize_game_version(value: &str) -> String {
    if let Some(rest) = value.strip_prefix("fabric-loader-") {
        if let Some((_, base)) = rest.split_once('-') {
            return base.to_string();
        }
    }
    if let Some(rest) = value.strip_prefix("quilt-loader-") {
        if let Some((_, base)) = rest.split_once('-') {
            return base.to_string();
        }
    }
    if let Some((base, _)) = value.split_once("-forge-") {
        return base.to_string();
    }
    if let Some((base, _)) = value.split_once("-neoforge-") {
        return base.to_string();
    }
    value.to_string()
}

/// 确保原版版本已安装，缺失时自动下载
async fn ensure_game_version(
    state: &AppState,
    app: &tauri::AppHandle,
    game_version: &str,
) -> Result<(), I18nError> {
    let versions_dir = crate::utils::paths::get_versions_dir(&state.minecraft_dir);
    let json_path = versions_dir.join(game_version).join(format!("{}.json", game_version));
    if json_path.is_file() {
        return Ok(());
    }

    emit_progress(app, "version", 0, 1, game_version);
    let source = read_download_source(&state.launcher_dir);
    crate::services::version::download::download_version(
        state,
        game_version,
        &state.minecraft_dir,
        app,
        &source,
    )
    .await
    .map_err(|_| i18n_err!("errors.modpack.gameVersionDownloadFailed", game_version))?;

    if !json_path.is_file() {
        return Err(i18n_err!("errors.modpack.gameVersionDownloadFailed", game_version));
    }
    emit_progress(app, "version", 1, 1, game_version);
    Ok(())
}

/// 确保加载器已安装，返回加载器派生版本目录名
async fn ensure_loader(
    state: &AppState,
    app: &tauri::AppHandle,
    meta: &PackMeta,
) -> Result<Option<String>, I18nError> {
    let Some(loader) = &meta.loader else {
        return Ok(None);
    };
    let versions_dir = crate::utils::paths::get_versions_dir(&state.minecraft_dir);

    if let Some(existing) = derive_loader_version_id(&meta.game_version, loader, meta.loader_version.as_deref()) {
        let json = versions_dir.join(&existing).join(format!("{}.json", existing));
        if json.is_file() {
            return Ok(Some(existing));
        }
    }

    emit_progress(app, "loader", 0, 1, &format!("{:?}", loader));
    crate::services::version::loader::remove_existing_loader_versions(
        &state.minecraft_dir,
        &meta.game_version,
        loader,
    )?;
    let installed = crate::services::version::loader::install_loader(
        state,
        &meta.game_version,
        loader,
        meta.loader_version.as_deref(),
        &state.minecraft_dir,
    )
    .await
    .map_err(|e| {
        I18nError::new("errors.modpack.loaderInstallFailed")
            .param("loader", format!("{:?}", loader))
            .param("detail", e.to_string())
    })?;

    let version_id = find_installed_loader_dir(&state.minecraft_dir, &meta.game_version, loader)
        .or_else(|| {
            derive_loader_version_id(&meta.game_version, loader, Some(&installed))
        })
        .ok_or_else(|| i18n_err!("errors.modpack.loaderInstallFailed", format!("{:?}", loader)))?;
    emit_progress(app, "loader", 1, 1, &format!("{:?}", loader));
    Ok(Some(version_id))
}

/// 安装后在 versions 目录里查找加载器实际生成的版本目录
/// 不同版本的加载器安装器命名可能不同，避免依赖固定格式
fn find_installed_loader_dir(
    minecraft_dir: &Path,
    game_version: &str,
    loader: &LoaderType,
) -> Option<String> {
    let versions_dir = crate::utils::paths::get_versions_dir(minecraft_dir);
    let entries = std::fs::read_dir(&versions_dir).ok()?;
    let mut candidates: Vec<(std::time::SystemTime, String)> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let json_path = path.join(format!("{}.json", name));
        let Ok(content) = std::fs::read_to_string(&json_path) else {
            continue;
        };
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else {
            continue;
        };
        if json.get("inheritsFrom").and_then(|v| v.as_str()) != Some(game_version) {
            continue;
        }
        let main_class = json.get("mainClass").and_then(|v| v.as_str()).unwrap_or("");
        let matched = match loader {
            LoaderType::Fabric => main_class.contains("fabricmc"),
            LoaderType::Quilt => main_class.contains("quiltmc"),
            LoaderType::Forge => main_class.contains("forge") && !main_class.contains("neoforge"),
            LoaderType::NeoForge => main_class.contains("neoforge") || main_class.contains("neoforged"),
        };
        if !matched {
            continue;
        }
        let modified = std::fs::metadata(&json_path)
            .and_then(|meta| meta.modified())
            .unwrap_or(std::time::UNIX_EPOCH);
        candidates.push((modified, name.to_string()));
    }

    candidates
        .into_iter()
        .max_by_key(|(modified, _)| *modified)
        .map(|(_, name)| name)
}

fn derive_loader_version_id(
    game_version: &str,
    loader: &LoaderType,
    loader_version: Option<&str>,
) -> Option<String> {
    let loader_version = loader_version?;
    Some(match loader {
        LoaderType::Fabric => format!("fabric-loader-{}-{}", loader_version, game_version),
        LoaderType::Quilt => format!("quilt-loader-{}-{}", loader_version, game_version),
        LoaderType::Forge => format!("{}-forge-{}", game_version, loader_version),
        LoaderType::NeoForge => format!("{}-neoforge-{}", loader_version, game_version),
    })
}

/// 生成本次导入使用的版本 ID，重名时自动追加序号
fn allocate_version_id(minecraft_dir: &Path, name: &str) -> String {
    let base = sanitize_version_id(name);
    let versions_dir = crate::utils::paths::get_versions_dir(minecraft_dir);

    let mut candidate = base.clone();
    let mut index = 2;
    while versions_dir.join(&candidate).exists() {
        candidate = format!("{}-{}", base, index);
        index += 1;
    }
    candidate
}

fn sanitize_version_id(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | '\0' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let cleaned = cleaned.trim().trim_end_matches(['.', ' ']).to_string();
    if cleaned.is_empty() {
        "modpack".to_string()
    } else {
        cleaned.chars().take(48).collect()
    }
}

/// 写入实例的 version.json（继承原版或加载器版本，启动时自动合并）
fn write_instance_version_json(
    minecraft_dir: &Path,
    instance_dir: &Path,
    version_id: &str,
    game_version: &str,
    loader_version_id: Option<&str>,
) -> Result<(), I18nError> {
    let json_path = instance_dir.join(format!("{}.json", version_id));

    let mut json = if let Some(loader_id) = loader_version_id {
        let versions_dir = crate::utils::paths::get_versions_dir(minecraft_dir);
        let source = versions_dir.join(loader_id).join(format!("{}.json", loader_id));
        std::fs::read_to_string(&source)
            .ok()
            .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
            .unwrap_or_else(|| {
                serde_json::json!({
                    "id": version_id,
                    "inheritsFrom": game_version,
                    "type": "release"
                })
            })
    } else {
        serde_json::json!({
            "id": version_id,
            "inheritsFrom": game_version,
            "type": "release"
        })
    };

    if let Some(obj) = json.as_object_mut() {
        obj.insert("id".to_string(), serde_json::Value::String(version_id.to_string()));
        obj.insert(
            "inheritsFrom".to_string(),
            serde_json::Value::String(game_version.to_string()),
        );
    }

    let content = serde_json::to_string_pretty(&json)
        .map_err(|e| i18n_err!("errors.version.serializeVersionJsonFailed", e))?;
    std::fs::write(&json_path, content)
        .map_err(|e| i18n_err!("errors.version.writeVersionJsonFailed", e))
}

/// 解压整合包内的 overrides（以及自有格式的版本目录内容）
fn extract_overrides(
    archive_path: &Path,
    instance_dir: &Path,
    minecraft_dir: &Path,
    lanyou_source_id: Option<&str>,
) -> Result<(), I18nError> {
    let file = std::fs::File::open(archive_path).map_err(|e| i18n_err!("errors.modpack.openFailed", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| i18n_err!("errors.modpack.invalidZip", e))?;

    for index in 0..archive.len() {
        let mut entry = match archive.by_index(index) {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let name = normalize_entry(entry.name());
        if name.is_empty() || name.ends_with('/') {
            continue;
        }

        let target = if let Some(source_id) = lanyou_source_id {
            let Some(rest) = name.strip_prefix(&format!("{}/", source_id)) else {
                continue;
            };
            lanyou_entry_target(rest, instance_dir, minecraft_dir)
        } else {
            let rest = name
                .strip_prefix("overrides/")
                .or_else(|| name.strip_prefix("client-overrides/"));
            rest.and_then(|rest| safe_join(instance_dir, rest))
        };

        let Some(target) = target else {
            continue;
        };
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let mut buffer = Vec::new();
        if entry.read_to_end(&mut buffer).is_err() {
            continue;
        }
        std::fs::write(&target, buffer).ok();
    }

    Ok(())
}

/// 自有格式条目映射：mods/saves 等放实例目录，libraries/assets 放共享目录
fn lanyou_entry_target(rest: &str, instance_dir: &Path, minecraft_dir: &Path) -> Option<PathBuf> {
    const INSTANCE_DIRS: [&str; 5] = ["mods", "saves", "resourcepacks", "shaderpacks", "config"];
    for dir in INSTANCE_DIRS {
        if let Some(rel) = rest.strip_prefix(&format!("{}/", dir)) {
            return safe_join(&instance_dir.join(dir), rel);
        }
    }
    if rest == "options.txt" {
        return safe_join(instance_dir, rest);
    }
    if let Some(rel) = rest.strip_prefix("libraries/") {
        return safe_join(&minecraft_dir.join("libraries"), rel);
    }
    if let Some(rel) = rest.strip_prefix("assets/") {
        return safe_join(&minecraft_dir.join("assets"), rel);
    }
    // 版本目录里的 json/jar/natives 等由启动器按需生成，忽略
    None
}

/// 拼接安全路径，拒绝绝对路径与 `..`，防止 zip-slip
fn safe_join(base: &Path, relative: &str) -> Option<PathBuf> {
    let relative = relative.replace('\\', "/");
    if relative.starts_with('/') || relative.contains(':') {
        return None;
    }
    let mut path = base.to_path_buf();
    for part in relative.split('/') {
        match part {
            "" | "." => continue,
            ".." => return None,
            _ => path.push(part),
        }
    }
    Some(path)
}

/// 下载整合包声明的所有文件
async fn download_pack_files(
    state: &AppState,
    app: &tauri::AppHandle,
    instance_dir: &Path,
    downloads: &[PendingDownload],
) -> Result<(u32, u32), I18nError> {
    if downloads.is_empty() {
        return Ok((0, 0));
    }

    // CurseForge 先批量查询文件名与下载地址
    let mut tasks: Vec<(Vec<String>, PathBuf)> = Vec::new();
    let mut curseforge_ids = Vec::new();
    for download in downloads {
        match download {
            PendingDownload::Url { urls, rel_path } => {
                if let Some(dest) = safe_join(instance_dir, rel_path) {
                    tasks.push((urls.clone(), dest));
                }
            }
            PendingDownload::CurseForge { file_id, .. } => curseforge_ids.push(*file_id),
        }
    }

    if !curseforge_ids.is_empty() {
        let resolved = resolve_curseforge_files(state, &curseforge_ids).await?;
        let mods_dir = instance_dir.join("mods");
        for info in resolved {
            let mut urls = Vec::new();
            if let Some(url) = info.download_url {
                urls.push(url);
            }
            urls.push(curseforge_cdn_url(info.id, &info.file_name));
            tasks.push((urls, mods_dir.join(&info.file_name)));
        }
    }

    let total = tasks.len() as u64;
    emit_progress(app, "mods", 0, total, "");

    let installed = Arc::new(AtomicU32::new(0));
    let failed = Arc::new(AtomicU32::new(0));
    let current = Arc::new(AtomicU32::new(0));

    let stream = futures_util::stream::iter(tasks.into_iter().map(|(urls, dest)| {
        let client = state.http_client.clone();
        let installed = installed.clone();
        let failed = failed.clone();
        let current = current.clone();
        let app = app.clone();
        async move {
            if download_to_file(&client, &urls, &dest).await.is_ok() {
                installed.fetch_add(1, Ordering::Relaxed);
            } else {
                failed.fetch_add(1, Ordering::Relaxed);
            }
            let done = current.fetch_add(1, Ordering::Relaxed) + 1;
            emit_progress(&app, "mods", done as u64, total, "");
        }
    }));

    use futures_util::StreamExt;
    stream.buffer_unordered(DOWNLOAD_CONCURRENCY).collect::<Vec<_>>().await;

    Ok((installed.load(Ordering::Relaxed), failed.load(Ordering::Relaxed)))
}

/// 批量查询 CurseForge 文件信息
async fn resolve_curseforge_files(
    state: &AppState,
    file_ids: &[u64],
) -> Result<Vec<CurseForgeFileInfo>, I18nError> {
    let api_key = crate::services::mod_platform::curseforge::get_curseforge_api_key(state)?;
    let mut result = Vec::new();

    for chunk in file_ids.chunks(1000) {
        let response = state
            .http_client
            .post(format!("{}/mods/files", CURSEFORGE_API))
            .header("x-api-key", &api_key)
            .json(&serde_json::json!({ "fileIds": chunk }))
            .send()
            .await
            .map_err(|e| i18n_err!("errors.modpack.curseforgeFilesFailed", e))?;

        if !response.status().is_success() {
            let detail = response.text().await.unwrap_or_default();
            return Err(i18n_err!("errors.modpack.curseforgeFilesFailed", detail));
        }

        let body: CurseForgeFilesResponse = response
            .json()
            .await
            .map_err(|e| i18n_err!("errors.modpack.curseforgeFilesFailed", e))?;
        result.extend(body.data);
    }

    Ok(result)
}

fn curseforge_cdn_url(file_id: u64, file_name: &str) -> String {
    format!(
        "https://edge.forgecdn.net/files/{}/{:03}/{}",
        file_id / 1000,
        file_id % 1000,
        file_name
    )
}

/// 下载单个文件，多个候选地址依次尝试（流式写入，避免大文件占满内存）
async fn download_to_file(
    client: &reqwest::Client,
    urls: &[String],
    dest: &Path,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    if dest.is_file() {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    for url in urls {
        let Ok(mut response) = client.get(url).send().await else {
            continue;
        };
        if !response.status().is_success() {
            continue;
        }
        let Ok(mut file) = tokio::fs::File::create(dest).await else {
            return Err("create failed".to_string());
        };
        let mut completed = true;
        loop {
            match response.chunk().await {
                Ok(Some(chunk)) => {
                    if file.write_all(&chunk).await.is_err() {
                        completed = false;
                        break;
                    }
                }
                Ok(None) => break,
                Err(_) => {
                    completed = false;
                    break;
                }
            }
        }
        if completed && file.flush().await.is_ok() {
            return Ok(());
        }
        let _ = tokio::fs::remove_file(dest).await;
    }

    Err("download failed".to_string())
}

/// 读取启动器设置中的下载源
fn read_download_source(launcher_dir: &Path) -> DownloadSource {
    std::fs::read_to_string(crate::utils::paths::get_settings_file(launcher_dir))
        .ok()
        .and_then(|content| serde_json::from_str::<Settings>(&content).ok())
        .map(|settings| settings.download_source)
        .unwrap_or(DownloadSource::Official)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_join_rejects_zip_slip() {
        let base = Path::new("C:/mc");
        assert!(safe_join(base, "../evil.exe").is_none());
        assert!(safe_join(base, "/abs").is_none());
        assert_eq!(safe_join(base, "mods/a.jar"), Some(base.join("mods").join("a.jar")));
    }

    #[test]
    fn test_sanitize_version_id() {
        assert_eq!(sanitize_version_id(" 整合包: 1.20.1 "), "整合包_ 1.20.1");
        assert_eq!(sanitize_version_id(""), "modpack");
    }

    #[test]
    fn test_parse_curseforge_loader() {
        let loader = CurseForgeModLoader {
            id: "fabric-0.15.11".to_string(),
            primary: true,
        };
        let (kind, version) = parse_curseforge_loader(&loader);
        assert_eq!(kind, Some(LoaderType::Fabric));
        assert_eq!(version.as_deref(), Some("0.15.11"));
    }

    #[test]
    fn test_derive_loader_version_id() {
        assert_eq!(
            derive_loader_version_id("1.20.1", &LoaderType::Forge, Some("47.2.0")).as_deref(),
            Some("1.20.1-forge-47.2.0")
        );
        assert_eq!(
            derive_loader_version_id("1.20.1", &LoaderType::Fabric, Some("0.15.11")).as_deref(),
            Some("fabric-loader-0.15.11-1.20.1")
        );
    }
}
