use crate::i18n::I18nError;
use crate::i18n_err;
use crate::services::easytier::{
    self, EasytierConfig, EasytierInstallInfo, EasytierStatus,
};
use crate::state::app_state::AppState;
use std::time::{Duration, Instant};
use tauri::State;
use tokio::net::TcpStream;

/// 获取 EasyTier 联机状态与日志
#[tauri::command]
pub async fn get_easytier_status(
    state: State<'_, AppState>,
) -> Result<EasytierStatus, I18nError> {
    let app_state = state.inner().clone();
    tokio::task::spawn_blocking(move || easytier::snapshot(&app_state))
        .await
        .map_err(|error| i18n_err!("errors.easytier.statusFailed", error))
}

/// 下载并安装 EasyTier 核心组件
#[tauri::command]
pub async fn install_easytier(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<EasytierInstallInfo, I18nError> {
    easytier::install(&state, &app).await
}

/// 启动 EasyTier 联机
#[tauri::command]
pub async fn start_easytier(
    state: State<'_, AppState>,
    config: EasytierConfig,
) -> Result<EasytierStatus, I18nError> {
    let app_state = state.inner().clone();
    tokio::task::spawn_blocking(move || easytier::start(&app_state, config))
        .await
        .map_err(|error| i18n_err!("errors.easytier.startFailed", error))?
}

/// 清空联机日志
#[tauri::command]
pub async fn clear_easytier_logs(
    state: State<'_, AppState>,
) -> Result<(), I18nError> {
    easytier::clear_logs(&state);
    Ok(())
}

/// 测试中转服务器 TCP 延迟（毫秒）
#[tauri::command]
pub async fn ping_easytier_server(peer: String) -> Result<u64, I18nError> {
    let target = peer
        .trim()
        .trim_start_matches("tcp://")
        .trim_start_matches("udp://");

    let resolved = tokio::time::timeout(
        Duration::from_secs(4),
        tokio::net::lookup_host(target),
    )
    .await
    .map_err(|_| i18n_err!("errors.easytier.pingFailed", "DNS 解析超时"))?
    .map_err(|error| i18n_err!("errors.easytier.pingFailed", error))?;

    let addresses: Vec<_> = resolved.collect();
    let address = addresses
        .iter()
        .find(|address| address.is_ipv4())
        .or_else(|| addresses.first())
        .copied()
        .ok_or_else(|| i18n_err!("errors.easytier.pingFailed", "DNS 未返回可用地址"))?;

    let mut best: Option<u64> = None;
    for _ in 0..3 {
        let started = Instant::now();
        if let Ok(Ok(_stream)) = tokio::time::timeout(
            Duration::from_secs(3),
            TcpStream::connect(address),
        )
        .await
        {
            let elapsed = started.elapsed().as_millis() as u64;
            best = Some(best.map_or(elapsed, |current| current.min(elapsed)));
        }
    }

    best.ok_or_else(|| i18n_err!("errors.easytier.pingFailed", "连接超时"))
}

/// 停止 EasyTier 联机
#[tauri::command]
pub async fn stop_easytier(
    state: State<'_, AppState>,
) -> Result<EasytierStatus, I18nError> {
    let app_state = state.inner().clone();
    tokio::task::spawn_blocking(move || easytier::stop(&app_state))
        .await
        .map_err(|error| i18n_err!("errors.easytier.stopFailed", error))?
}
