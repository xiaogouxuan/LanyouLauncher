use serde::{Deserialize, Serialize};
use crate::models::version::LoaderType;

/// Mod 来源平台
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ModSource {
    Modrinth,
    CurseForge,
}

/// Mod 依赖
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModDependency {
    pub id: String,
    pub name: String,
    pub required: bool,
}

/// Mod 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModInfo {
    pub id: String,
    pub project_id: Option<String>,
    pub name: String,
    pub version: String,
    pub version_id: String,
    pub file_name: Option<String>,
    pub loader: LoaderType,
    pub game_version: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub source: ModSource,
    pub enabled: bool,
    pub dependencies: Vec<ModDependency>,
    /// 安装路径（仅已安装 Mod 有效）
    pub install_path: Option<String>,
    /// 所属实例 ID（全局 mods 为 "global"）
    pub instance_id: Option<String>,
    /// 是否安装在版本隔离目录
    pub is_isolated: Option<bool>,
}

/// 下载完成的 Mod 文件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadedModFile {
    pub file_name: String,
    pub version_number: String,
    pub name: String,
}

/// Mod 版本信息（用于版本选择弹窗）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModVersionInfo {
    pub version_id: String,
    pub version_number: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<LoaderType>,
    pub file_name: String,
    pub file_size: u64,
    pub download_url: String,
    pub dependencies: Vec<ModDependency>,
}