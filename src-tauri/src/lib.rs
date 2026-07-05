pub mod commands;
pub mod i18n;
pub mod models;
pub mod services;
pub mod state;
pub mod utils;

use state::app_state::AppState;

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
            Ok(())
        })
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // 账号
            commands::account::get_accounts,
            commands::account::login_offline,
            commands::account::login_microsoft,
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
            commands::version::install_loader,
            commands::version::delete_version,
            commands::version::toggle_version_isolation,
            commands::version::select_version_game_dir,
            commands::version::clear_version_game_dir,
            // 启动
            commands::launch::start_game,
            commands::launch::stop_game,
            // Mod
            commands::mod_manager::search_modrinth,
            commands::mod_manager::search_curseforge,
            commands::mod_manager::download_mod,
            commands::mod_manager::get_installed_mods,
            commands::mod_manager::toggle_mod,
            commands::mod_manager::delete_mod,
            // 设置
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::detect_java,
            commands::settings::select_java_for_version,
            commands::settings::select_background_image,
            // 系统
            commands::system::get_system_info,
            commands::system::open_url,
            // 更新
            commands::update::check_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}