use reqwest::Client;
use std::time::Duration;

/// 创建统一的 HTTP 客户端，配置 TLS、超时和 User-Agent
pub fn create_http_client() -> Client {
    Client::builder()
        .user_agent("LanyouLauncher/0.1.0")
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .tcp_keepalive(Duration::from_secs(60))
        .build()
        .expect("无法创建 HTTP 客户端")
}