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
    pub name: String,
    pub version: String,
    pub version_id: String,
    pub loader: LoaderType,
    pub game_version: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub source: ModSource,
    pub enabled: bool,
    pub dependencies: Vec<ModDependency>,
}