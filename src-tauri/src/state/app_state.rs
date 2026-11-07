use reqwest::Client;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
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
    /// 当前活跃的 Minecraft 子进程句柄（key 为进程 PID）
    pub active_process: Arc<Mutex<HashMap<u32, std::process::Child>>>,
    /// EasyTier 联机运行时状态
    pub easytier: Arc<std::sync::Mutex<crate::services::easytier::EasytierRuntime>>,
    /// 各版本下载的取消标记（value 为 true 时下载循环立即退出）
    pub download_cancels: Arc<std::sync::Mutex<HashMap<String, Arc<AtomicBool>>>>,
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
            active_process: Arc::new(Mutex::new(HashMap::new())),
            easytier: Arc::new(std::sync::Mutex::new(
                crate::services::easytier::EasytierRuntime::default(),
            )),
            download_cancels: Arc::new(std::sync::Mutex::new(HashMap::new())),
        }
    }

    /// 为某个版本下载注册取消标记
    pub fn register_download_cancel(&self, version_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut cancels) = self.download_cancels.lock() {
            cancels.insert(version_id.to_string(), flag.clone());
        }
        flag
    }

    /// 下载结束后移除取消标记
    pub fn clear_download_cancel(&self, version_id: &str) {
        if let Ok(mut cancels) = self.download_cancels.lock() {
            cancels.remove(version_id);
        }
    }

    /// 请求取消某个版本的下载，返回是否命中正在进行的任务
    pub fn cancel_download(&self, version_id: &str) -> bool {
        let Ok(cancels) = self.download_cancels.lock() else {
            return false;
        };
        if let Some(flag) = cancels.get(version_id) {
            flag.store(true, std::sync::atomic::Ordering::SeqCst);
            true
        } else {
            false
        }
    }
}