use serde::{Deserialize, Serialize};

/// 版本类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum VersionType {
    Release,
    Snapshot,
    PreRelease,
    ReleaseCandidate,
    OldBeta,
    OldAlpha,
    Pending,
    AprilFools,
    Unobfuscated,
}

/// 加载器类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum LoaderType {
    Forge,
    Fabric,
    NeoForge,
    Quilt,
}

/// 版本信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionInfo {
    /// 版本 ID（如 1.21.1）
    pub id: String,
    /// 版本类型
    pub version_type: VersionType,
    /// 发布时间
    pub release_time: String,
    /// 加载器类型（无则为原版）
    pub loader: Option<LoaderType>,
    /// 安装时间戳
    pub install_time: Option<i64>,
    /// 是否版本隔离
    pub is_isolated: bool,
    /// 自定义游戏目录
    pub game_dir: Option<String>,
    /// 版本额外描述（如愚人节版本介绍）
    pub lore: Option<String>,
}

/// 版本元数据（启动器专属配置，保存在 versions/<id>/lanyou.json）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct VersionMeta {
    /// 是否启用版本隔离
    pub is_isolated: bool,
    /// 自定义游戏目录（空字符串表示使用默认隔离目录）
    pub game_dir: String,
}

/// 下载进度
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub id: String,
    pub task_type: String,
    pub total: u64,
    pub current: u64,
    pub status: String,
}