use crate::i18n::I18nError;

/// 在客人本机开启局域网桥接，返回代理端口
#[tauri::command]
pub async fn start_lan_bridge(
    host: String,
    port: u16,
    motd: Option<String>,
) -> Result<u16, I18nError> {
    let host = host.trim().to_string();
    if host.is_empty() || port == 0 {
        return Err(I18nError::new("multiplayer.enterNeedAddress"));
    }
    let name = motd.unwrap_or_else(|| "Lanyou Room".to_string());
    crate::services::lan_bridge::start(&host, port, &name)
        .await
        .map_err(|detail| I18nError::new("multiplayer.enterNeedAddress").param("detail", detail))
}

/// 关闭局域网桥接
#[tauri::command]
pub fn stop_lan_bridge() {
    crate::services::lan_bridge::stop();
}
