pub mod commands;
pub mod i18n;
pub mod models;
pub mod services;
pub mod state;
pub mod utils;

use state::app_state::AppState;
use tauri::Manager;

/**
 * 启动遮罩结束：把只有 Logo 的小窗恢复成主界面尺寸并居中，
 * 同时恢复正常的最小尺寸限制。
 */
#[tauri::command]
fn finish_splash(window: tauri::WebviewWindow) -> Result<(), String> {
    window
        .set_min_size(Some(tauri::LogicalSize::new(820.0, 520.0)))
        .map_err(|e| e.to_string())?;
    window
        .set_size(tauri::LogicalSize::new(900.0, 560.0))
        .map_err(|e| e.to_string())?;
    window.center().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // 先缩成 Logo 大小的小窗，避免整扇 900×560 的透明窗口盖在桌面上
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_size(tauri::LogicalSize::new(200.0, 200.0));
                let _ = win.center();
            }
            Ok(())
        })
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            finish_splash,
            // 账号
            commands::account::get_accounts,
            commands::account::login_offline,
            commands::account::login_microsoft,
            commands::account::login_third_party,
            commands::account::delete_account,
            commands::account::switch_account,
            commands::account::refresh_token,
            commands::account::select_account_skin,
            commands::account::clear_account_skin,
            commands::account::read_skin_data_url,
            // 版本
            commands::version::get_manifest,
            commands::version::get_installed_versions,
            commands::version::download_version,
            commands::version::cancel_version_download,
            commands::version::get_loader_versions,
            commands::version::install_loader,
            commands::version::delete_version,
            commands::version::toggle_version_isolation,
            commands::version::select_version_game_dir,
            commands::version::clear_version_game_dir,
            commands::version::select_version_java,
            commands::version::clear_version_java,
            commands::version::export_version_pack,
            commands::version::open_version_dir,
            // 启动
            commands::launch::start_game,
            commands::launch::stop_game,
            // Mod
            commands::mod_manager::search_modrinth,
            commands::mod_manager::search_curseforge,
            commands::mod_manager::get_mod_versions,
            commands::mod_manager::get_mod_details,
            commands::mod_manager::download_mod,
            commands::mod_manager::download_mod_to_local,
            commands::mod_manager::get_installed_mods,
            commands::mod_manager::toggle_mod,
            commands::mod_manager::delete_mod,
            commands::mod_manager::open_mods_dir,
            // 设置
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::detect_java,
            commands::settings::select_java_for_version,
            commands::settings::download_java,
            commands::settings::get_java_version,
            commands::settings::select_background_image,
            // 系统
            commands::system::get_system_info,
            commands::system::open_url,
            commands::system::open_path,
            commands::system::open_game_dir,
            // 更新
            commands::update::check_update,
            // EasyTier 联机
            commands::easytier::get_easytier_status,
            commands::easytier::install_easytier,
            commands::easytier::start_easytier,
            commands::easytier::stop_easytier,
            commands::easytier::clear_easytier_logs,
            commands::easytier::ping_easytier_server,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // 退出时停止联机进程，避免虚拟网卡进程残留
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<AppState>();
                crate::services::easytier::shutdown(&state);
            }
        });
}