import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useLaunchStore } from "@/stores/launchStore";
import { useTaskStore, createTaskId } from "@/stores/taskStore";
import { t } from "@/i18n";
import { formatError } from "@/utils/format";
import type { LaunchConfig, LogEntry, LaunchProgress, LaunchInstance } from "@/types/launch";

let unlistenLog: UnlistenFn | null = null;
let unlistenFailed: UnlistenFn | null = null;
let unlistenProgress: UnlistenFn | null = null;
let unlistenInstanceRunning: UnlistenFn | null = null;
let unlistenInstanceExited: UnlistenFn | null = null;

/**
 * 等待后端确认游戏真的起来了（进程存活检测通过），
 * 期间一旦收到 launch-failed 就立刻失败，避免“点了就显示启动成功”。
 */
function waitForGameRunning(pid: number, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    const listeners: UnlistenFn[] = [];
    let timer: number | undefined;
    let settled = false;

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      listeners.forEach((unlisten) => unlisten());
      action();
    };

    timer = window.setTimeout(() => {
      finish(() => reject(new Error(t("errors.launch.startTimeout"))));
    }, timeoutMs);

    Promise.all([
      listen<LaunchInstance>("launch-instance-running", (event) => {
        if (event.payload.pid === pid) finish(() => resolve());
      }),
      listen<LogEntry>("launch-failed", (event) => {
        finish(() => reject(new Error(t(event.payload.message))));
      }),
    ])
      .then(([stopRunning, stopFailed]) => {
        if (settled) {
          stopRunning();
          stopFailed();
        } else {
          listeners.push(stopRunning, stopFailed);
        }
      })
      .catch(() => {
        finish(() => reject(new Error(t("errors.launch.startTimeout"))));
      });
  });
}

export const launchService = {
  async startGame(config: LaunchConfig): Promise<number> {
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
      const pid = await invoke<number>("start_game", { config });
      // 进程句柄返回 ≠ 启动成功：必须等后端做存活检测，
      // 确认游戏窗口正常起来后才算启动成功，否则抛出错误
      const launchStore = useLaunchStore.getState();
      launchStore.setLaunchProgress({
        step: Math.max(0, launchStore.launchProgress.total - 1),
        label: t("launch.progress.waitingWindow"),
      });
      await waitForGameRunning(pid);
      return pid;
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

  async stopGame(pid?: number): Promise<void> {
    return invoke("stop_game", { pid });
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
        const isRunning = step >= total;
        const store = useTaskStore.getState();
        const runningTask = store.tasks.find(
          (t) => t.type === "game_launch" && t.status === "running",
        );
        if (runningTask) {
          store.updateTask(runningTask.id, {
            progress,
            message: t(label),
            status: isRunning ? "success" : "running",
          });
        }
      });
    }
    if (!unlistenInstanceRunning) {
      unlistenInstanceRunning = await listen<LaunchInstance>("launch-instance-running", (event) => {
        const { pid, version_id } = event.payload;
        useLaunchStore.getState().addRunningInstance({
          pid,
          version_id,
          startTime: Date.now(),
        });
      });
    }
    if (!unlistenInstanceExited) {
      unlistenInstanceExited = await listen<LaunchInstance>("launch-instance-exited", (event) => {
        const { pid } = event.payload;
        useLaunchStore.getState().removeRunningInstance(pid);
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
    if (unlistenInstanceRunning) {
      unlistenInstanceRunning();
      unlistenInstanceRunning = null;
    }
    if (unlistenInstanceExited) {
      unlistenInstanceExited();
      unlistenInstanceExited = null;
    }
  },
};
