import { useState, useEffect, useCallback } from "react";
import { X, ListTodo, CheckCircle2, AlertCircle, Loader2, Trash2, Zap } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useTaskStore } from "@/stores/taskStore";
import { launchService } from "@/services/launchService";
import type { Task, TaskStatus } from "@/types/task";

interface TaskPanelProps {
  open: boolean;
  onClose: () => void;
}

const statusIcon: Record<TaskStatus, React.ReactNode> = {
  pending: <span className="w-4 h-4 rounded-full border-2 border-outline/30" />,
  running: <Loader2 size={16} className="text-primary animate-spin" />,
  success: <CheckCircle2 size={16} className="text-secondary" />,
  error: <AlertCircle size={16} className="text-error" />,
};

const statusTextColor: Record<TaskStatus, string> = {
  pending: "text-on-surface-variant",
  running: "text-primary",
  success: "text-secondary",
  error: "text-error",
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
        // 忽略停止失败
      }
      updateTask(task.id, {
        status: "error",
        message: t("task.cancelled"),
        error: t("task.cancelled"),
      });
    } else {
      // 下载任务暂无后端中止接口，先从列表移除
      removeTask(task.id);
    }
  };

  return (
    <div className="p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{statusIcon[task.status]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-on-surface truncate">
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {task.message && (
              <p className={`text-xs truncate ${statusTextColor[task.status]}`}>
                {task.message}
              </p>
            )}
            {task.status === "running" && task.speed && task.speed > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-on-surface-variant">
                <Zap size={10} />
                {formatSpeed(task.speed)}
              </span>
            )}
          </div>
          {task.status === "running" && task.total && task.total > 0 && (
            <div className="mt-2">
              <div className="h-1 w-full bg-surface-container-highest rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
              <p className="text-[10px] text-on-surface-variant mt-1">
                {task.progress}%
              </p>
            </div>
          )}
        </div>
        {task.status === "running" && (
          <button
            onClick={handleCancel}
            title={t("task.cancel")}
            className="p-1.5 rounded-full text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors"
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
      const timer = setTimeout(() => setVisible(false), 250);
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

  const activeTasks = tasks.filter((t) => t.status === "running" || t.status === "pending");
  const completedTasks = tasks.filter((t) => t.status === "success" || t.status === "error");

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* 背景遮罩 */}
      <div
        className={`absolute inset-0 bg-scrim transition-opacity duration-250 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* 抽屉 */}
      <div
        className={`relative w-full max-w-[360px] h-full bg-surface-container-high border-l border-outline-variant shadow-lg flex flex-col rounded-l-2xl transition-transform duration-250 ease-standard ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ backgroundColor: "var(--md-sys-color-surface-container-high)" }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
          <div className="flex items-center gap-2">
            <ListTodo size={18} className="text-primary" />
            <h2 className="text-base font-semibold text-on-surface">
              {t("task.title")}
            </h2>
            {activeTasks.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-primary-container text-on-primary-container text-xs font-medium">
                {activeTasks.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {completedTasks.length > 0 && (
              <button
                onClick={clearCompleted}
                className="p-1.5 rounded-full text-on-surface-variant hover:bg-on-surface/[0.08] hover:text-on-surface transition-colors"
                title={t("task.clearCompleted")}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-on-surface-variant hover:bg-on-surface/[0.08] hover:text-on-surface transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 任务列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tasks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-on-surface-variant gap-3">
              <ListTodo size={40} className="opacity-30" />
              <p className="text-sm">{t("task.empty")}</p>
            </div>
          ) : (
            <>
              {activeTasks.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
              {completedTasks.length > 0 && activeTasks.length > 0 && (
                <div className="py-2 border-t border-outline-variant" />
              )}
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
