use reqwest::Client;
use std::time::Duration;

/// 创建统一的 HTTP 客户端，配置 TLS、连接复用和下载友好的超时
pub fn create_http_client() -> Client {
    Client::builder()
        .user_agent("LanyouLauncher/0.5.3")
        // 下载大文件不能再限制总时长，仅限制建连与单次读取，避免大文件中途被掐断
        .connect_timeout(Duration::from_secs(10))
        .read_timeout(Duration::from_secs(45))
        .tcp_keepalive(Duration::from_secs(60))
        .tcp_nodelay(true)
        .pool_max_idle_per_host(32)
        .pool_idle_timeout(Duration::from_secs(90))
        .build()
        .expect("无法创建 HTTP 客户端")
}