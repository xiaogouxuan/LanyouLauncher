import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useLaunchStore } from "@/stores/launchStore";
import { useTaskStore, createTaskId } from "@/stores/taskStore";
import { t } from "@/i18n";
import { formatError } from "@/utils/format";
import type { LaunchConfig, LogEntry, LaunchProgress } from "@/types/launch";

let unlistenLog: UnlistenFn | null = null;
let unlistenFailed: UnlistenFn | null = null;
let unlistenProgress: UnlistenFn | null = null;

export const launchService = {
  async startGame(config: LaunchConfig): Promise<void> {
    // 确保监听器已注册
    await this.ensureListeners();

    const taskId = createTaskId("game_launch", config.version_id);
    useTaskStore.getState().addTask({
      id: taskId,
      type: "game_launch",
      title: t("task.gameLaunch", { version: config.version_id }),
      status: "running",
      progress: 0,
      message: t("launch.progress.prepare"),
    });

    try {
      await invoke("start_game", { config });
      useLaunchStore.getState().setIsRunning(true);
      useTaskStore.getState().updateTask(taskId, {
        progress: 100,
        status: "success",
        message: t("launch.gameRunning"),
      });
    } catch (error) {
      const message = formatError(error);
      useTaskStore.getState().updateTask(taskId, {
        progress: 100,
        status: "error",
        message,
        error: message,
      });
      throw error;
    }
  },

  async stopGame(): Promise<void> {
    return invoke("stop_game");
  },

  async ensureListeners() {
    if (!unlistenLog) {
      unlistenLog = await listen<LogEntry>("launch-log", (event) => {
        useLaunchStore.getState().appendLog(event.payload);
      });
    }
    if (!unlistenFailed) {
      unlistenFailed = await listen<LogEntry>("launch-failed", (event) => {
        const entry = event.payload;
        useLaunchStore.getState().setLaunchFailed({
          ...entry,
          message: t(entry.message),
        });

        // 将失败同步到当前进行中的启动任务
        const store = useTaskStore.getState();
        const runningTask = store.tasks.find(
          (t) => t.type === "game_launch" && t.status === "running",
        );
        if (runningTask) {
          store.updateTask(runningTask.id, {
            status: "error",
            message: t(entry.message),
            error: t(entry.message),
          });
        }
      });
    }
    if (!unlistenProgress) {
      unlistenProgress = await listen<LaunchProgress>("launch-progress", (event) => {
        const { step, total, label } = event.payload;
        useLaunchStore.getState().setLaunchProgress({ step, total, label: t(label) });

        const progress = total > 0 ? Math.round((step / total) * 100) : 0;
        const store = useTaskStore.getState();
        const runningTask = store.tasks.find(
          (t) => t.type === "game_launch" && t.status === "running",
        );
        if (runningTask) {
          store.updateTask(runningTask.id, {
            progress,
            message: t(label),
          });
        }
      });
    }
  },

  unsubscribeLogs() {
    if (unlistenLog) {
      unlistenLog();
      unlistenLog = null;
    }
    if (unlistenFailed) {
      unlistenFailed();
      unlistenFailed = null;
    }
    if (unlistenProgress) {
      unlistenProgress();
      unlistenProgress = null;
    }
  },
};
