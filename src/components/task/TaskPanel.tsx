import { useState, useEffect, useCallback } from "react";
import { X, ListTodo, CheckCircle2, AlertCircle, Loader2, Trash2, Zap } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useTaskStore } from "@/stores/taskStore";
import { launchService } from "@/services/launchService";
import { versionService } from "@/services/versionService";
import { ignoreTaskEvents } from "@/services/taskService";
import type { Task, TaskStatus } from "@/types/task";

interface TaskPanelProps {
  open: boolean;
  onClose: () => void;
}

const statusIcon: Record<TaskStatus, React.ReactNode> = {
  pending: <span className="w-4 h-4 rounded-full border-2 border-outline-variant" />,
  running: <Loader2 size={16} className="text-primary animate-spin" />,
  success: <CheckCircle2 size={16} className="text-success" />,
  error: <AlertCircle size={16} className="text-danger" />,
};

const statusTextColor: Record<TaskStatus, string> = {
  pending: "text-on-surface-variant",
  running: "text-primary",
  success: "text-success",
  error: "text-danger",
};

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return "";
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
}

function TaskItem({ task }: { task: Task }) {
  const { t } = useTranslation();
  const { updateTask, removeTask } = useTaskStore();

  const handleCancel = async () => {
    if (task.type === "game_launch") {
      try {
        await launchService.stopGame();
      } catch {
        // 停止失败不阻断任务清理
      }
      updateTask(task.id, {
        status: "error",
        message: t("task.cancelled"),
        error: t("task.cancelled"),
      });
    } else if (task.type === "version_download") {
      // 版本下载：通知后端取消并立即移除任务
      const versionId = task.id.slice("version_download:".length);
      await versionService.cancelDownload(versionId);
    } else {
      // 其他下载任务没有后端中止接口：忽略后续进度事件后再移除，避免任务被事件重新加回来
      ignoreTaskEvents(task.id);
      removeTask(task.id);
    }
  };

  return (
    <div className="px-4 py-3 border-b border-outline-variant last:border-b-0 hover:bg-surface-hover/50 transition-colors">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5">{statusIcon[task.status]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-on-surface truncate">{task.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {task.message && (
              <p className={`text-[11px] truncate ${statusTextColor[task.status]}`}>
                {task.message}
              </p>
            )}
            {task.status === "running" && task.speed && task.speed > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-on-surface-subtle tabular-nums">
                <Zap size={10} />
                {formatSpeed(task.speed)}
              </span>
            )}
          </div>
          {task.status === "running" && task.total && task.total > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1 flex-1 bg-surface-active rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
              <span className="text-[10px] text-on-surface-subtle tabular-nums">
                {task.progress}%
              </span>
            </div>
          )}
        </div>
        {task.status === "running" && (
          <button
            onClick={handleCancel}
            title={t("task.cancel")}
            className="p-1.5 rounded-btn text-on-surface-subtle hover:bg-danger-container hover:text-danger transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export function TaskPanel({ open, onClose }: TaskPanelProps) {
  const { t } = useTranslation();
  const { tasks, clearCompleted } = useTaskStore();
  const [visible, setVisible] = useState(false);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      setVisible(true);
    } else {
      const timer = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) handleClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, handleClose]);

  if (!visible) return null;

  const activeTasks = tasks.filter((task) => task.status === "running" || task.status === "pending");
  const completedTasks = tasks.filter((task) => task.status === "success" || task.status === "error");

  return (
    <div className="absolute inset-0 z-50 flex justify-end overflow-hidden">
      <div
        className={`absolute inset-0 bg-scrim transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      <div
        className={`relative w-full max-w-[340px] h-full bg-surface-container border-l border-outline-variant
          flex flex-col transition-transform duration-200 ease-standard ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
      >
        <div className="flex items-center justify-between h-12 px-4 border-b border-outline-variant shrink-0">
          <div className="flex items-center gap-2">
            <ListTodo size={16} className="text-primary" />
            <h2 className="text-[13px] font-semibold text-on-surface">{t("task.title")}</h2>
            {activeTasks.length > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-[4px] bg-primary-muted text-primary text-[11px] font-medium flex items-center justify-center tabular-nums">
                {activeTasks.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {completedTasks.length > 0 && (
              <button
                onClick={clearCompleted}
                className="p-1.5 rounded-btn text-on-surface-subtle hover:bg-surface-hover hover:text-on-surface transition-colors"
                title={t("task.clearCompleted")}
              >
                <Trash2 size={15} />
              </button>
            )}
            <button
              onClick={onClose}
              title={t("common.close")}
              className="p-1.5 rounded-btn text-on-surface-subtle hover:bg-surface-hover hover:text-on-surface transition-colors"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tasks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-on-surface-subtle gap-3">
              <ListTodo size={36} className="opacity-25" />
              <p className="text-[13px]">{t("task.empty")}</p>
            </div>
          ) : (
            <>
              {activeTasks.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
              {completedTasks.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
