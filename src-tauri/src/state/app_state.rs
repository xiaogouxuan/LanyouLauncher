use reqwest::Client;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

/// 应用全局状态，通过 Tauri 托管，可在任意 command 中访问
#[derive(Clone)]
pub struct AppState {
    /// HTTP 客户端（复用连接池）
    pub http_client: Client,
    /// 启动器数据目录
    pub launcher_dir: PathBuf,
    /// 默认 Minecraft 目录
    pub minecraft_dir: PathBuf,
    /// 当前活跃的 Minecraft 子进程句柄
    pub active_process: Arc<Mutex<Option<std::process::Child>>>,
}

impl AppState {
    pub fn new() -> Self {
        let launcher_dir = crate::utils::paths::get_launcher_dir();
        let minecraft_dir = crate::utils::paths::get_default_minecraft_dir();

        // 确保数据目录存在
        std::fs::create_dir_all(&launcher_dir).ok();
        std::fs::create_dir_all(&minecraft_dir).ok();

        Self {
            http_client: crate::utils::http::create_http_client(),
            launcher_dir,
            minecraft_dir,
            active_process: Arc::new(Mutex::new(None)),
        }
    }
}