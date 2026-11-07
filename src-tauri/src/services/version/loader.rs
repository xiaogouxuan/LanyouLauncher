// Deserialization-only fields
#![allow(dead_code)]

use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::version::{LoaderType, LoaderVersionInfo};
use crate::state::app_state::AppState;
use serde::Deserialize;
use std::path::Path;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Debug, Deserialize)]
struct FabricLoaderVersion {
    loader: FabricLoaderInfo,
    intermediary: FabricMavenInfo,
}

#[derive(Debug, Deserialize)]
struct FabricLoaderInfo {
    version: String,
    maven: String,
}

#[derive(Debug, Deserialize)]
struct FabricMavenInfo {
    version: String,
    maven: String,
}

#[derive(Debug, Deserialize)]
struct QuiltLoaderVersion {
    loader: QuiltLoaderInfo,
    intermediary: QuiltMavenInfo,
    launcher_meta: QuiltLauncherMeta,
}

#[derive(Debug, Deserialize)]
struct QuiltLoaderInfo {
    version: String,
    maven: String,
}

#[derive(Debug, Deserialize)]
struct QuiltMavenInfo {
    version: String,
    maven: String,
}

#[derive(Debug, Deserialize)]
struct QuiltLauncherMeta {
    version: QuiltLauncherVersion,
}

#[derive(Debug, Deserialize)]
struct QuiltLauncherVersion {
    // quilt-loader 的 launcher 元数据，按需扩展
}

/// 获取指定 Minecraft 版本可用的加载器版本列表
pub async fn get_loader_versions(
    state: &AppState,
    version_id: &str,
    loader: &LoaderType,
) -> Result<Vec<LoaderVersionInfo>, I18nError> {
    match loader {
        LoaderType::Fabric => fabric_loader_versions(state, version_id).await,
        LoaderType::Quilt => quilt_loader_versions(state, version_id).await,
        LoaderType::Forge => forge_loader_versions(state, version_id).await,
        LoaderType::NeoForge => neoforge_loader_versions(state, version_id).await,
    }
}

/// 安装 Mod 加载器，返回实际安装的加载器版本号
pub async fn install_loader(
    state: &AppState,
    version_id: &str,
    loader: &LoaderType,
    loader_version: Option<&str>,
    minecraft_dir: &Path,
) -> Result<String, I18nError> {
    match loader {
        LoaderType::Fabric => install_fabric(state, version_id, loader_version, minecraft_dir).await,
        LoaderType::Forge => install_forge(state, version_id, loader_version, minecraft_dir).await,
        LoaderType::NeoForge => install_neoforge(state, version_id, loader_version, minecraft_dir).await,
        LoaderType::Quilt => install_quilt(state, version_id, loader_version, minecraft_dir).await,
    }
}

/// 删除指定加载器在同一 Minecraft 版本上已生成的旧版本目录
/// 用于覆盖安装时清理旧 Loader 产物
pub fn remove_existing_loader_versions(
    minecraft_dir: &Path,
    version_id: &str,
    loader: &LoaderType,
) -> Result<(), I18nError> {
    let versions_dir = crate::utils::paths::get_versions_dir(minecraft_dir);
    if !versions_dir.exists() {
        return Ok(());
    }

    let patterns: Vec<String> = match loader {
        LoaderType::Fabric => vec![format!("fabric-loader-*-{}", version_id)],
        LoaderType::Quilt => vec![format!("quilt-loader-*-{}", version_id)],
        LoaderType::Forge => vec![format!("{}-forge-*", version_id)],
        LoaderType::NeoForge => vec![format!("{}-neoforge-*", version_id)],
    };

    for entry in std::fs::read_dir(&versions_dir)
        .map_err(|e| i18n_err!("errors.version.readVersionJsonFailed", e))?
    {
        let entry = entry.map_err(|e| i18n_err!("errors.version.readVersionJsonFailed", e))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let dir_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        if matches_loader_pattern(dir_name, &patterns) {
            if let Err(e) = std::fs::remove_dir_all(&path) {
                log::warn!("删除旧版本目录失败 {}: {}", path.display(), e);
            }
        }
    }

    Ok(())
}

fn matches_loader_pattern(dir_name: &str, patterns: &[String]) -> bool {
    patterns.iter().any(|pattern| {
        let parts: Vec<&str> = pattern.split('*').collect();
        if parts.is_empty() {
            return dir_name == pattern;
        }
        if parts.len() == 1 {
            return dir_name == pattern;
        }

        let mut current = dir_name;
        for (idx, part) in parts.iter().enumerate() {
            if part.is_empty() {
                continue;
            }
            if idx == 0 {
                if !current.starts_with(part) {
                    return false;
                }
                current = &current[part.len()..];
            } else if idx == parts.len() - 1 {
                return current.ends_with(part);
            } else {
                match current.find(part) {
                    Some(pos) => current = &current[pos + part.len()..],
                    None => return false,
                }
            }
        }
        true
    })
}

/// 获取 Fabric 加载器版本列表
async fn fabric_loader_versions(
    state: &AppState,
    version_id: &str,
) -> Result<Vec<LoaderVersionInfo>, I18nError> {
    let meta_url = format!("https://meta.fabricmc.net/v2/versions/loader/{}", version_id);
    let response = state
        .http_client
        .get(&meta_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.version.fetchFabricMetaFailed", e))?;

    if !response.status().is_success() {
        return Err(i18n_err!("errors.version.fabricNotSupported", version_id));
    }

    let fabric_meta: Vec<FabricLoaderVersion> = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.version.parseFabricMetaFailed", e))?;

    Ok(fabric_meta
        .into_iter()
        .enumerate()
        .map(|(idx, v)| LoaderVersionInfo {
            version: v.loader.version,
            is_recommended: idx == 0,
            is_latest: idx == 0,
        })
        .collect())
}

/// 安装 Fabric 加载器，返回实际安装的加载器版本号
async fn install_fabric(
    state: &AppState,
    version_id: &str,
    loader_version: Option<&str>,
    minecraft_dir: &Path,
) -> Result<String, I18nError> {
    let meta_url = format!("https://meta.fabricmc.net/v2/versions/loader/{}", version_id);
    let response = state
        .http_client
        .get(&meta_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.version.fetchFabricMetaFailed", e))?;

    if !response.status().is_success() {
        return Err(i18n_err!("errors.version.fabricNotSupported", version_id));
    }

    let fabric_meta: Vec<FabricLoaderVersion> = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.version.parseFabricMetaFailed", e))?;

    let selected = if let Some(target) = loader_version {
        fabric_meta
            .into_iter()
            .find(|v| v.loader.version == target)
            .ok_or(i18n_err!("errors.version.noFabricLoaderVersion"))?
    } else {
        fabric_meta
            .into_iter()
            .next()
            .ok_or(i18n_err!("errors.version.noFabricLoaderVersion"))?
    };

    let loader_version = &selected.loader.version;
    let intermediary_version = &selected.intermediary.version;

    // 下载 Fabric Loader jar
    let libraries_dir = minecraft_dir.join("libraries");
    let loader_jar_path = maven_to_path(&selected.loader.maven);
    let loader_dest = libraries_dir.join(&loader_jar_path);

    if let Some(parent) = loader_dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| i18n_err!("errors.version.createDirFailed", e))?;
    }

    let loader_url = format!("https://maven.fabricmc.net/{}", loader_jar_path);
    download_file(&state.http_client, &loader_url, &loader_dest).await?;

    // 下载 intermediary jar
    let intermediary_jar_path = maven_to_path(&format!(
        "net.fabricmc:intermediary:{}",
        intermediary_version
    ));
    let intermediary_dest = libraries_dir.join(&intermediary_jar_path);
    if let Some(parent) = intermediary_dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| i18n_err!("errors.version.createDirFailed", e))?;
    }
    let intermediary_url = format!("https://maven.fabricmc.net/{}", intermediary_jar_path);
    download_file(&state.http_client, &intermediary_url, &intermediary_dest).await?;

    // 创建 Fabric 版本 JSON（继承原版）
    let versions_dir = crate::utils::paths::get_versions_dir(minecraft_dir);
    let fabric_version_id = format!("fabric-loader-{}-{}", loader_version, version_id);
    let fabric_version_dir = versions_dir.join(&fabric_version_id);
    std::fs::create_dir_all(&fabric_version_dir)
        .map_err(|e| i18n_err!("errors.version.createVersionDirFailed", e))?;

    let fabric_json = serde_json::json!({
        "id": fabric_version_id,
        "inheritsFrom": version_id,
        "type": "release",
        "mainClass": "net.fabricmc.loader.impl.launch.knot.KnotClient",
        "arguments": {
            "game": []
        },
        "libraries": [
            {
                "name": selected.loader.maven,
                "url": "https://maven.fabricmc.net/"
            },
            {
                "name": format!("net.fabricmc:intermediary:{}", intermediary_version),
                "url": "https://maven.fabricmc.net/"
            }
        ]
    });

    let json_path = fabric_version_dir.join(format!("{}.json", fabric_version_id));
    let json_content = serde_json::to_string_pretty(&fabric_json)
        .map_err(|e| i18n_err!("errors.version.serializeVersionJsonFailed", e))?;
    std::fs::write(&json_path, json_content)
        .map_err(|e| i18n_err!("errors.version.writeVersionJsonFailed", e))?;

    Ok(loader_version.clone())
}

/// 获取 Quilt 加载器版本列表
async fn quilt_loader_versions(
    state: &AppState,
    version_id: &str,
) -> Result<Vec<LoaderVersionInfo>, I18nError> {
    let meta_url = format!("https://meta.quiltmc.org/v3/versions/loader/{}", version_id);
    let response = state
        .http_client
        .get(&meta_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.version.fetchQuiltMetaFailed", e))?;

    if !response.status().is_success() {
        return Err(i18n_err!("errors.version.quiltNotSupported", version_id));
    }

    let quilt_meta: Vec<QuiltLoaderVersion> = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.version.parseQuiltMetaFailed", e))?;

    Ok(quilt_meta
        .into_iter()
        .enumerate()
        .map(|(idx, v)| LoaderVersionInfo {
            version: v.loader.version,
            is_recommended: idx == 0,
            is_latest: idx == 0,
        })
        .collect())
}

/// 安装 Quilt 加载器（逻辑与 Fabric 类似），返回实际安装的加载器版本号
async fn install_quilt(
    state: &AppState,
    version_id: &str,
    loader_version: Option<&str>,
    minecraft_dir: &Path,
) -> Result<String, I18nError> {
    let meta_url = format!("https://meta.quiltmc.org/v3/versions/loader/{}", version_id);
    let response = state
        .http_client
        .get(&meta_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.version.fetchQuiltMetaFailed", e))?;

    if !response.status().is_success() {
        return Err(i18n_err!("errors.version.quiltNotSupported", version_id));
    }

    let quilt_meta: Vec<QuiltLoaderVersion> = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.version.parseQuiltMetaFailed", e))?;

    let selected = if let Some(target) = loader_version {
        quilt_meta
            .into_iter()
            .find(|v| v.loader.version == target)
            .ok_or(i18n_err!("errors.version.noQuiltLoaderVersion"))?
    } else {
        quilt_meta
            .into_iter()
            .next()
            .ok_or(i18n_err!("errors.version.noQuiltLoaderVersion"))?
    };

    let loader_version = &selected.loader.version;
    let intermediary_version = &selected.intermediary.version;

    let libraries_dir = minecraft_dir.join("libraries");
    let loader_jar_path = maven_to_path(&selected.loader.maven);
    let loader_dest = libraries_dir.join(&loader_jar_path);
    if let Some(parent) = loader_dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| i18n_err!("errors.version.createDirFailed", e))?;
    }
    let loader_url = format!("https://maven.quiltmc.org/repository/release/{}", loader_jar_path);
    download_file(&state.http_client, &loader_url, &loader_dest).await?;

    let intermediary_jar_path = maven_to_path(&format!(
        "org.quiltmc:quilt-intermediary:{}",
        intermediary_version
    ));
    let intermediary_dest = libraries_dir.join(&intermediary_jar_path);
    if let Some(parent) = intermediary_dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| i18n_err!("errors.version.createDirFailed", e))?;
    }
    let intermediary_url = format!(
        "https://maven.quiltmc.org/repository/release/{}",
        intermediary_jar_path
    );
    download_file(&state.http_client, &intermediary_url, &intermediary_dest).await?;

    let versions_dir = crate::utils::paths::get_versions_dir(minecraft_dir);
    let quilt_version_id = format!("quilt-loader-{}-{}", loader_version, version_id);
    let quilt_version_dir = versions_dir.join(&quilt_version_id);
    std::fs::create_dir_all(&quilt_version_dir)
        .map_err(|e| i18n_err!("errors.version.createVersionDirFailed", e))?;

    let quilt_json = serde_json::json!({
        "id": quilt_version_id,
        "inheritsFrom": version_id,
        "type": "release",
        "mainClass": "org.quiltmc.loader.impl.launch.knot.KnotClient",
        "arguments": {
            "game": []
        },
        "libraries": [
            {
                "name": selected.loader.maven,
                "url": "https://maven.quiltmc.org/repository/release/"
            },
            {
                "name": format!("org.quiltmc:quilt-intermediary:{}", intermediary_version),
                "url": "https://maven.quiltmc.org/repository/release/"
            }
        ]
    });

    let json_path = quilt_version_dir.join(format!("{}.json", quilt_version_id));
    let json_content = serde_json::to_string_pretty(&quilt_json)
        .map_err(|e| i18n_err!("errors.version.serializeVersionJsonFailed", e))?;
    std::fs::write(&json_path, json_content)
        .map_err(|e| i18n_err!("errors.version.writeVersionJsonFailed", e))?;

    Ok(loader_version.clone())
}

/// 获取 NeoForge 加载器版本列表
async fn neoforge_loader_versions(
    state: &AppState,
    version_id: &str,
) -> Result<Vec<LoaderVersionInfo>, I18nError> {
    let metadata_url =
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
    let response = state
        .http_client
        .get(metadata_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.version.fetchNeoforgeMetaFailed", e))?;

    if !response.status().is_success() {
        return Err(i18n_err!("errors.version.neoforgeNotSupported", version_id));
    }

    let metadata_text = response
        .text()
        .await
        .map_err(|e| i18n_err!("errors.version.readNeoforgeMetaFailed", e))?;

    let major_prefix = neoforge_major_prefix(version_id)
        .ok_or(i18n_err!("errors.version.noNeoforgeVersion", version_id))?;

    let mut versions: Vec<LoaderVersionInfo> = Vec::new();
    for line in metadata_text.lines() {
        let trimmed = line.trim();
        if let Some(start) = trimmed.find("<version>") {
            if let Some(end) = trimmed.find("</version>") {
                let version = &trimmed[start + 9..end];
                if version.starts_with(&major_prefix) && versions.iter().all(|v| v.version != version) {
                    versions.push(LoaderVersionInfo {
                        version: version.to_string(),
                        is_recommended: false,
                        is_latest: false,
                    });
                }
            }
        }
    }

    // 按版本号降序排列，标记最新版
    versions.sort_by(|a, b| b.version.cmp(&a.version));
    if let Some(first) = versions.first_mut() {
        first.is_latest = true;
    }

    if versions.is_empty() {
        return Err(i18n_err!("errors.version.noNeoforgeVersion", version_id));
    }

    Ok(versions)
}

/// 获取 Forge 加载器版本列表（推荐版与最新版）
async fn forge_loader_versions(
    state: &AppState,
    version_id: &str,
) -> Result<Vec<LoaderVersionInfo>, I18nError> {
    let forge_manifest_url = format!(
        "https://files.minecraftforge.net/net/minecraftforge/forge/index_{}.json",
        version_id
    );
    let response = state
        .http_client
        .get(&forge_manifest_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.version.fetchForgeManifestFailed", e))?;

    if !response.status().is_success() {
        return Err(i18n_err!("errors.version.forgeNotSupported", version_id));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.version.readForgeResponseFailed", e))?;

    let promos = body
        .get("promos")
        .and_then(|p| p.as_object())
        .ok_or(i18n_err!("errors.version.parseForgeManifestFailed"))?;

    let recommended_key = format!("{}-recommended", version_id);
    let latest_key = format!("{}-latest", version_id);

    let recommended = promos
        .get(&recommended_key)
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let latest = promos
        .get(&latest_key)
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());

    let mut versions = Vec::new();
    if let Some(v) = recommended {
        versions.push(LoaderVersionInfo {
            version: v.clone(),
            is_recommended: true,
            is_latest: latest.as_ref() == Some(&v),
        });
    }
    if let Some(v) = latest {
        if versions.iter().all(|info| info.version != v) {
            versions.push(LoaderVersionInfo {
                version: v,
                is_recommended: false,
                is_latest: true,
            });
        }
    }

    if versions.is_empty() {
        return Err(i18n_err!("errors.version.noForgeVersion", version_id));
    }

    Ok(versions)
}

/// 安装 Forge 加载器，返回实际安装的加载器版本号
/// 通过下载 Forge installer 并以无窗口方式运行 --installClient 完成安装
async fn install_forge(
    state: &AppState,
    version_id: &str,
    loader_version: Option<&str>,
    minecraft_dir: &Path,
) -> Result<String, I18nError> {
    // 获取 Forge 版本列表
    let forge_manifest_url = format!(
        "https://files.minecraftforge.net/net/minecraftforge/forge/index_{}.json",
        version_id
    );
    let response = state
        .http_client
        .get(&forge_manifest_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.version.fetchForgeManifestFailed", e))?;

    if !response.status().is_success() {
        return Err(i18n_err!("errors.version.forgeNotSupported", version_id));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| i18n_err!("errors.version.readForgeResponseFailed", e))?;

    let promos = body
        .get("promos")
        .and_then(|p| p.as_object())
        .ok_or(i18n_err!("errors.version.parseForgeManifestFailed"))?;

    let recommended_key = format!("{}-recommended", version_id);
    let latest_key = format!("{}-latest", version_id);

    let forge_version = if let Some(target) = loader_version {
        // 校验用户指定的版本是否存在于 promos 中
        let valid = promos
            .get(&recommended_key)
            .and_then(|v| v.as_str())
            .map(|v| v == target)
            .unwrap_or(false)
            || promos
                .get(&latest_key)
                .and_then(|v| v.as_str())
                .map(|v| v == target)
                .unwrap_or(false);
        if !valid {
            return Err(i18n_err!("errors.version.noForgeVersion", version_id));
        }
        target.to_string()
    } else {
        promos
            .get(&recommended_key)
            .or_else(|| promos.get(&latest_key))
            .and_then(|v| v.as_str())
            .ok_or(i18n_err!("errors.version.noForgeVersion", version_id))?
            .to_string()
    };

    // Forge 版本号可能是 "41.1.0"，需要拼接成完整 installer 坐标
    let forge_full_version = if forge_version.contains(version_id) {
        forge_version.clone()
    } else {
        format!("{}-{}", version_id, forge_version)
    };

    let installer_url = format!(
        "https://maven.minecraftforge.net/net/minecraftforge/forge/{}/forge-{}-installer.jar",
        forge_full_version, forge_full_version
    );

    let installer_path = minecraft_dir.join("cache").join(format!(
        "forge-{}-installer.jar",
        forge_full_version
    ));
    if let Some(parent) = installer_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| i18n_err!("errors.version.createDirFailed", e))?;
    }

    download_file(&state.http_client, &installer_url, &installer_path).await?;

    // 运行 installer
    let java_path = resolve_installer_java(state, version_id)?;
    run_installer_jar(&installer_path, minecraft_dir, &java_path).await?;

    Ok(forge_version)
}

/// 安装 NeoForge 加载器，返回实际安装的加载器版本号
/// 通过 maven-metadata.xml 获取适合该 MC 版本的最新 NeoForge 版本号，再下载 installer 运行
async fn install_neoforge(
    state: &AppState,
    version_id: &str,
    loader_version: Option<&str>,
    minecraft_dir: &Path,
) -> Result<String, I18nError> {
    let metadata_url =
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
    let response = state
        .http_client
        .get(metadata_url)
        .send()
        .await
        .map_err(|e| i18n_err!("errors.version.fetchNeoforgeMetaFailed", e))?;

    if !response.status().is_success() {
        return Err(i18n_err!("errors.version.neoforgeNotSupported", version_id));
    }

    let metadata_text = response
        .text()
        .await
        .map_err(|e| i18n_err!("errors.version.readNeoforgeMetaFailed", e))?;

    let neo_version = if let Some(target) = loader_version {
        target.to_string()
    } else {
        parse_latest_neoforge_version(&metadata_text, version_id)
            .ok_or(i18n_err!("errors.version.noNeoforgeVersion", version_id))?
    };

    let installer_url = format!(
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/{}/neoforge-{}-installer.jar",
        neo_version, neo_version
    );

    let installer_path = minecraft_dir
        .join("cache")
        .join(format!("neoforge-{}-installer.jar", neo_version));
    if let Some(parent) = installer_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| i18n_err!("errors.version.createDirFailed", e))?;
    }

    download_file(&state.http_client, &installer_url, &installer_path).await?;
    let java_path = resolve_installer_java(state, version_id)?;
    run_installer_jar(&installer_path, minecraft_dir, &java_path).await?;

    Ok(neo_version)
}

/// 从 maven-metadata.xml 中找出匹配 Minecraft 主版本号的最新 NeoForge 版本
/// 例如 MC 1.20.1 对应 NeoForge 版本形如 47.x.x（NeoForge 大版本号对应 MC 版本）
fn parse_latest_neoforge_version(metadata: &str, version_id: &str) -> Option<String> {
    let major_prefix = neoforge_major_prefix(version_id)?;

    // 用简单字符串解析提取 <version>.*</version>
    let mut latest: Option<String> = None;
    for line in metadata.lines() {
        let trimmed = line.trim();
        if let Some(start) = trimmed.find("<version>") {
            if let Some(end) = trimmed.find("</version>") {
                let version = &trimmed[start + 9..end];
                if version.starts_with(&major_prefix) {
                    if latest.as_ref().map(|l| version > l.as_str()).unwrap_or(true) {
                        latest = Some(version.to_string());
                    }
                }
            }
        }
    }

    latest
}

/// 获取 NeoForge 大版本号前缀
fn neoforge_major_prefix(version_id: &str) -> Option<String> {
    let parts: Vec<&str> = version_id.split('.').collect();
    if parts.len() < 2 {
        return None;
    }

    // NeoForge 大版本号对应关系：1.20.1 -> 47, 1.20.2 -> 48, ...
    // 1.21+ 采用与 Minecraft 次版本号一致的策略：1.21.x -> 21.x, 1.22.x -> 22.x
    let prefix = match (parts[0], parts[1]) {
        ("1", "20") => {
            let patch = parts.get(2).and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
            match patch {
                1 => "47.",
                2 => "48.",
                3 => "49.",
                4 => "50.",
                5 => "51.",
                6 => "52.",
                _ => return None,
            }
        }
        ("1", "21") => {
            let patch = parts.get(2).and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
            return Some(format!("21.{}.", patch));
        }
        ("1", "22") => "22.",
        ("1", minor) => {
            if let Ok(n) = minor.parse::<u32>() {
                if n >= 23 {
                    return Some(format!("{}.", n));
                }
            }
            return None;
        }
        _ => return None,
    };

    Some(prefix.to_string())
}

/// 解析用于运行 Forge/NeoForge installer 的 Java 路径。
/// 优先使用 settings 中匹配该 MC 版本的 Java，否则自动检测并选择，仍无则报错。
fn resolve_installer_java(
    state: &AppState,
    version_id: &str,
) -> Result<String, I18nError> {
    let settings_file = crate::utils::paths::get_settings_file(&state.launcher_dir);
    let java_paths: Vec<String> = if settings_file.exists() {
        std::fs::read_to_string(&settings_file)
            .ok()
            .and_then(|content| serde_json::from_str::<crate::models::settings::Settings>(&content).ok())
            .map(|s| s.java_paths)
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let (selected, _) = crate::services::java::detector::select_java_for_version(
        version_id,
        &state.minecraft_dir,
        &java_paths,
    );

    if selected != "java" {
        return Ok(selected);
    }

    // settings 中无匹配时尝试自动检测
    let detected = crate::services::java::detector::detect_java_runtimes();
    let (auto_selected, _) = crate::services::java::detector::select_java_for_version(
        version_id,
        &state.minecraft_dir,
        &detected,
    );

    if auto_selected != "java" {
        return Ok(auto_selected);
    }

    Err(i18n_err!("errors.java.notFound"))
}

/// 运行 installer jar，安装加载器到指定 minecraft 目录
async fn run_installer_jar(
    installer_path: &std::path::Path,
    minecraft_dir: &Path,
    java_path: &str,
) -> Result<(), I18nError> {
    let mut cmd = std::process::Command::new(java_path);
    cmd.arg("-jar")
        .arg(installer_path)
        .arg("--installClient")
        .arg(minecraft_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .output()
        .map_err(|e| i18n_err!("errors.version.runInstallerFailed", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(i18n_err!("errors.version.installerFailed", stderr.to_string()));
    }

    Ok(())
}

/// 下载文件
async fn download_file(
    client: &reqwest::Client,
    url: &str,
    dest: &std::path::PathBuf,
) -> Result<(), I18nError> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| {
            I18nError::new("errors.version.downloadFailed")
                .param("url", url)
                .param("detail", e.to_string())
        })?;

    if !response.status().is_success() {
        return Err(
            I18nError::new("errors.version.downloadHttpFailed")
                .param("url", url)
                .param("status", response.status().to_string()),
        );
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| {
            I18nError::new("errors.version.readResponseFailed")
                .param("url", url)
                .param("detail", e.to_string())
        })?;

    std::fs::write(dest, &bytes)
        .map_err(|e| {
            I18nError::new("errors.version.writeFileFailed")
                .param("path", dest.display().to_string())
                .param("detail", e.to_string())
        })?;

    Ok(())
}

/// 将 Maven 坐标转换为文件路径
fn maven_to_path(maven: &str) -> String {
    let parts: Vec<&str> = maven.split(':').collect();
    if parts.len() >= 3 {
        let group = parts[0].replace('.', "/");
        let artifact = parts[1];
        let version = parts[2];
        format!("{}/{}/{}/{}-{}.jar", group, artifact, version, artifact, version)
    } else {
        format!("{}.jar", maven.replace(':', "/"))
    }
}
