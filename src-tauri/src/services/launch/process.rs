use crate::i18n::I18nError;
use crate::i18n_err;
use crate::models::launch::LaunchConfig;
use crate::state::app_state::AppState;
use log::info;
use std::path::Path;
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::Emitter;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 启动 Minecraft 子进程并捕获日志
pub async fn spawn_minecraft(
    config: &LaunchConfig,
    state: &AppState,
    app_handle: &tauri::AppHandle,
) -> Result<(), I18nError> {
    let total_steps: u32 = 5;
    let mut current_step: u32 = 0;

    let emit_progress = |app: &tauri::AppHandle, step: u32, label: &str| {
        let _ = app.emit(
            "launch-progress",
            crate::models::launch::LaunchProgress {
                step,
                total: total_steps,
                label: label.to_string(),
            },
        );
    };

    // 检查是否已有进程在运行
    {
        let proc = state.active_process.lock().await;
        if proc.is_some() {
            return Err(i18n_err!("errors.launch.alreadyRunning"));
        }
    }

    current_step += 1;
    emit_progress(app_handle, current_step, "launch.progress.prepare");

    // 校验 Java 可执行文件是否存在
    if config.java_path != "java" && !Path::new(&config.java_path).exists() {
        return Err(i18n_err!("errors.launch.javaNotFound", &config.java_path));
    }

    current_step += 1;
    emit_progress(app_handle, current_step, "launch.progress.account");

    // 加载活跃账号
    let accounts_file = crate::utils::paths::get_accounts_file(&state.launcher_dir);
    let mut account = if accounts_file.exists() {
        let content = std::fs::read_to_string(&accounts_file)
            .map_err(|e| i18n_err!("errors.launch.readAccountsFailed", e))?;
        let accounts: Vec<crate::models::account::Account> = serde_json::from_str(&content)
            .unwrap_or_default();
        accounts.into_iter().find(|a| a.is_active)
            .ok_or(i18n_err!("errors.launch.noActiveAccount"))?
    } else {
        return Err(i18n_err!("errors.launch.noAccount"));
    };

    // 微软账号在启动前自动刷新即将过期的令牌
    crate::services::auth::microsoft::refresh_microsoft_account_if_needed(&mut account, state).await?;
    crate::commands::account::save_account(state, &account)?;

    current_step += 1;
    emit_progress(app_handle, current_step, "launch.progress.args");

    // 构建启动参数
    let args = crate::services::launch::config::build_launch_args(
        config,
        &state.minecraft_dir,
        &account,
    )?;

    current_step += 1;
    emit_progress(app_handle, current_step, "launch.progress.jvm");

    // 打印启动命令（对 accessToken 脱敏，方便排查 Demo 模式等问题）
    let args_for_log: Vec<String> = {
        let mut redacted = Vec::with_capacity(args.len());
        let mut skip_next = false;
        for (_i, arg) in args.iter().enumerate() {
            if skip_next {
                redacted.push("***".to_string());
                skip_next = false;
                continue;
            }
            if arg == "--accessToken" || arg == "--uuid" {
                redacted.push(arg.clone());
                skip_next = true;
                continue;
            }
            // 对形如 -Dauth_access_token=xxx 的参数也脱敏
            if arg.starts_with("-Dauth_access_token=") || arg.starts_with("-Dauth_uuid=") {
                let key = arg.split('=').next().unwrap_or(arg);
                redacted.push(format!("{}=***", key));
                continue;
            }
            redacted.push(arg.clone());
        }
        redacted
    };
    info!("启动 Minecraft: {} {:?}", config.java_path, args_for_log);

    let mut cmd = Command::new(&config.java_path);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Windows 上隐藏 Java 的命令行窗口，避免弹出一个独立的 CMD 窗口
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd
        .spawn()
        .map_err(|e| i18n_err!("errors.launch.startProcessFailed", e))?;

    // 捕获 stdout 日志
    let stdout = child.stdout.take().ok_or(i18n_err!("errors.launch.stdoutUnavailable"))?;
    let stderr = child.stderr.take().ok_or(i18n_err!("errors.launch.stderrUnavailable"))?;
    let app_handle_stdout = app_handle.clone();
    let app_handle_stderr = app_handle.clone();
    let state_for_wait = state.clone();

    let _now = chrono::Utc::now().timestamp_millis();

    // 异步读取 stdout
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                let _ = app_handle_stdout.emit("launch-log", crate::models::launch::LogEntry {
                    level: "info".to_string(),
                    message: line,
                    timestamp: chrono::Utc::now().timestamp_millis(),
                });
            }
        }
    });

    // 异步读取 stderr
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                let level = if line.contains("ERROR") || line.contains("FATAL") {
                    "error"
                } else if line.contains("WARN") {
                    "warn"
                } else {
                    "info"
                };
                let _ = app_handle_stderr.emit("launch-log", crate::models::launch::LogEntry {
                    level: level.to_string(),
                    message: line,
                    timestamp: chrono::Utc::now().timestamp_millis(),
                });
            }
        }
    });

    // 保存进程句柄，并监听进程退出以清理状态
    let child_id = child.id();
    {
        let mut proc = state.active_process.lock().await;
        *proc = Some(child);
    }

    // 等待一小段时间，确认 JVM 没有立即崩溃
    let app_handle_check = app_handle.clone();
    let state_for_check = state.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        let still_running = {
            let mut proc = state_for_check.active_process.lock().await;
            if let Some(ref mut child) = *proc {
                matches!(child.try_wait(), Ok(None))
            } else {
                false
            }
        };

        if !still_running {
            let _ = app_handle_check.emit("launch-failed", crate::models::launch::LogEntry {
                level: "error".to_string(),
                message: "errors.launch.processExitedEarly".to_string(),
                timestamp: chrono::Utc::now().timestamp_millis(),
            });
        }
    });

    tokio::spawn(async move {
        // 等待进程结束
        let exit_status = {
            let mut proc = state_for_wait.active_process.lock().await;
            if let Some(ref mut child) = *proc {
                child.wait().ok()
            } else {
                None
            }
        };

        // 进程结束后清空句柄
        {
            let mut proc = state_for_wait.active_process.lock().await;
            *proc = None;
        }

        if let Some(status) = exit_status {
            info!("Minecraft 进程已退出 (pid={}): {}", child_id, status);
        } else {
            info!("Minecraft 进程句柄已清理 (pid={})", child_id);
        }
    });

    current_step += 1;
    emit_progress(app_handle, current_step, "launch.progress.running");

    info!("Minecraft 进程已启动");
    Ok(())
}

/// 停止 Minecraft 子进程
pub async fn kill_minecraft(state: &AppState) -> Result<(), I18nError> {
    let mut proc = state.active_process.lock().await;
    if let Some(ref mut child) = *proc {
        child.kill().map_err(|e| i18n_err!("errors.launch.stopProcessFailed", e))?;
        *proc = None;
        info!("Minecraft 进程已停止");
        Ok(())
    } else {
        Err(i18n_err!("errors.launch.noRunningProcess"))
    }
}