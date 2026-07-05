import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useTaskStore } from "@/stores/taskStore";
import { t } from "@/i18n";
import type { DownloadProgress } from "@/types/version";
import type { TaskStatus, TaskType } from "@/types/task";

let unlistenDownload: UnlistenFn | null = null;

function translateStatus(status: string): string {
  const translated = t(status);
  // 如果翻译缺失（返回原 key），给出一个可读默认值
  if (translated !== status) return translated;
  const fallbackKey = `task.status.${status}`;
  const fallback = t(fallbackKey);
  if (fallback !== fallbackKey) return fallback;
  return status;
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return "";
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
}

function getTaskTitle(type: string, id: string): string {
  if (type === "version_download") {
    return t("task.versionDownload", { version: id });
  }
  if (type === "mod_download") {
    // id 格式 "Source:modId"，解析为更友好的显示
    const parts = id.split(":");
    if (parts.length >= 2) {
      const source = parts[0];
      const modId = parts.slice(1).join(":");
      return t("task.modDownload", { id: `${source} #${modId}` });
    }
    return t("task.modDownload", { id });
  }
  return id;
}

function getTaskStatus(
  current: number,
  total: number,
  status: string,
): TaskStatus {
  if (status.toLowerCase().includes("complete")) return "success";
  if (status.toLowerCase().includes("error") || status.toLowerCase().includes("fail")) return "error";
  if (current >= total && total > 0) return "success";
  return "running";
}

export const taskService = {
  async startListening() {
    if (unlistenDownload) return;

    unlistenDownload = await listen<DownloadProgress>(
      "download-progress",
      (event) => {
        const { id, task_type, total, current, status, speed, stage } = event.payload;
        const store = useTaskStore.getState();
        const taskId = `${task_type}:${id}`;
        const progress = total > 0 ? Math.round((current / total) * 100) : 0;
        const taskStatus = getTaskStatus(current, total, status);
        const message = translateStatus(stage || status);

        if (!store.tasks.some((task) => task.id === taskId)) {
          store.addTask({
            id: taskId,
            type: task_type as TaskType,
            title: getTaskTitle(task_type, id),
            status: "running",
            progress: 0,
            total: Number(total),
            current: Number(current),
            message,
            speed,
            stage,
          });
        }

        store.updateTask(taskId, {
          id: taskId,
          progress,
          total: Number(total),
          current: Number(current),
          message,
          speed,
          stage,
          status: taskStatus,
        });
      },
    );
  },

  stopListening() {
    if (unlistenDownload) {
      unlistenDownload();
      unlistenDownload = null;
    }
  },
};
