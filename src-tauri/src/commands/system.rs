use crate::i18n::I18nError;
use crate::i18n_err;
use crate::state::app_state::AppState;
use sysinfo::System;
use tauri::State;

/// 根据系统总内存（MB）推荐 Minecraft 最大内存。
/// 规则参考 HMCL/PCL-CE：
/// - 最少分配 2048 MB
/// - 系统内存 <= 4GB：分配 1/4
/// - 系统内存 <= 8GB：分配 1/3
/// - 系统内存 <= 16GB：分配 1/2
/// - 系统内存 > 16GB：分配 8192 MB（8GB）
/// 最终向上取整到 256 MB 的倍数。
/// 注意：sysinfo::System::total_memory() 返回的是字节(bytes)，需要除以 1024² 得到 MB
pub fn recommend_memory_mb(total_memory_mb: u64) -> u32 {
    let recommended = if total_memory_mb <= 4096 {
        total_memory_mb / 4
    } else if total_memory_mb <= 8192 {
        total_memory_mb / 3
    } else if total_memory_mb <= 16384 {
        total_memory_mb / 2
    } else {
        8192
    };

    let recommended = recommended.max(2048).min(total_memory_mb.saturating_sub(1024));
    // 向上取整到 256 MB 的倍数
    let rounded = ((recommended + 255) / 256) * 256;
    rounded as u32
}

/// 获取系统信息
#[tauri::command]
pub async fn get_system_info() -> Result<String, I18nError> {
    let mut system = System::new_all();
    system.refresh_memory();
    let total_memory_mb = system.total_memory() / 1024;
    let recommended_memory = recommend_memory_mb(total_memory_mb);

    let info = serde_json::json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "family": std::env::consts::FAMILY,
        "total_memory_mb": total_memory_mb,
        "recommended_memory_mb": recommended_memory,
    });
    Ok(info.to_string())
}

/// 在外部浏览器中打开 URL
#[tauri::command]
pub async fn open_url(_state: State<'_, AppState>, url: String) -> Result<(), I18nError> {
    // 使用系统默认浏览器打开
    open::that(&url).map_err(|e| i18n_err!("errors.system.openUrlFailed", e))
}