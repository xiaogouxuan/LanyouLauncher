use serde::{Deserialize, Serialize};

/// 游戏启动配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchConfig {
    /// 版本 ID
    pub version_id: String,
    /// 账号 ID
    pub account_id: String,
    /// 最小内存（MB）
    pub memory_min: u32,
    /// 最大内存（MB）
    pub memory_max: u32,
    /// JVM 额外参数
    pub jvm_args: Vec<String>,
    /// 窗口宽度
    pub resolution_width: u32,
    /// 窗口高度
    pub resolution_height: u32,
    /// Java 可执行文件路径
    pub java_path: String,
    /// 自定义游戏目录（可选）
    pub game_dir: Option<String>,
}

/// 日志条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub level: String,
    pub message: String,
    pub timestamp: i64,
}

/// 启动进度
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchProgress {
    pub step: u32,
    pub total: u32,
    pub label: String,
}