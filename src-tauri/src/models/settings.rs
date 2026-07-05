use serde::{Deserialize, Serialize};

/// 主题模式
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    #[serde(alias = "Light")]
    Light,
    #[serde(alias = "Dark")]
    Dark,
    #[serde(alias = "System")]
    System,
}

/// 下载源
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DownloadSource {
    #[serde(alias = "Official")]
    Official,
    #[serde(alias = "Bmclapi")]
    Bmclapi,
}

/// 启动器全局设置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// 语言
    pub language: String,
    /// 主题
    pub theme: ThemeMode,
    /// 下载源
    pub download_source: DownloadSource,
    /// Java 路径列表
    pub java_paths: Vec<String>,
    /// 默认内存（MB）
    pub default_memory: u32,
    /// 默认游戏目录
    pub default_game_dir: String,
    /// 自动检查更新
    pub auto_update: bool,
    /// 内置壁纸名称（空字符串表示不使用，img1/img2 为内置壁纸）
    pub wallpaper: String,
    /// 背景图片路径（空字符串表示无背景）
    pub background_image: String,
    /// 背景图片不透明度（0.0 - 1.0）
    pub background_opacity: f32,
    /// 背景图片模糊半径（px）
    pub background_blur: f32,
    /// 主题主色（HEX 格式，如 #3B82F6）
    pub theme_color: String,
    /// 游戏启动成功后是否关闭启动器
    pub close_after_launch: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "zh-CN".to_string(),
            theme: ThemeMode::System,
            download_source: DownloadSource::Official,
            java_paths: Vec::new(),
            default_memory: 4096,
            default_game_dir: String::new(),
            auto_update: true,
            wallpaper: "img1".to_string(),
            background_image: String::new(),
            background_opacity: 0.15,
            background_blur: 0.0,
            theme_color: "#3B82F6".to_string(),
            close_after_launch: false,
        }
    }
}