import React, { useState, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X, ListTodo } from "lucide-react";
import { useTranslation } from "@/i18n";
import { APP_NAME } from "@/utils/constants";
import { TaskPanel } from "@/components/task/TaskPanel";
import { useTaskStore } from "@/stores/taskStore";

const logoUrl = new URL("/logo.png", import.meta.url).href;

export function Titlebar() {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const activeTaskCount = useTaskStore((s) =>
    s.tasks.filter((t) => t.status === "running" || t.status === "pending").length
  );

  useEffect(() => {
    const win = getCurrentWindow();
    const check = async () => {
      try {
        setIsMaximized(await win.isMaximized());
      } catch {
        // ignore
      }
    };
    check();

    let unlisten: (() => void) | undefined;
    win.onResized?.(() => check()).then((fn) => {
      unlisten = fn;
    }).catch(() => {});

    return () => {
      unlisten?.();
    };
  }, []);

  const handleMinimize = useCallback(async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      console.error("minimize failed", e);
    }
  }, []);

  const handleMaximize = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      await win.toggleMaximize();
      setIsMaximized(await win.isMaximized());
    } catch (e) {
      console.error("maximize failed", e);
    }
  }, []);

  const handleClose = useCallback(async () => {
    try {
      await getCurrentWindow().close();
    } catch (e) {
      console.error("close failed", e);
    }
  }, []);

  return (
    <div
      className="h-10 flex items-center justify-between bg-surface-container border-b border-outline/30 select-none rounded-t-window"
      style={{ backgroundColor: "var(--md-sys-color-surface-container)" }}
      onDoubleClick={handleMaximize}
    >
      {/* 左侧：拖拽区域 */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2.5 pl-4 h-full flex-1"
      >
        <img
          src={logoUrl}
          alt="logo"
          className="w-6 h-6 rounded-lg object-contain ring-2 ring-surface/60"
        />
        <span className="text-sm font-semibold text-on-surface tracking-tight">
          {APP_NAME}
        </span>
      </div>

      {/* 右侧：任务与窗口控制按钮 */}
      <div className="flex h-full" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <button
          type="button"
          onClick={() => setTaskPanelOpen(true)}
          title={String(t("titlebar.tasks"))}
          className="relative w-10 h-full flex items-center justify-center text-on-surface-variant hover:bg-on-surface/[0.08] hover:text-on-surface rounded-none transition-colors"
        >
          <ListTodo size={18} />
          {activeTaskCount > 0 && (
            <span className="absolute top-2 right-1.5 w-2 h-2 rounded-full bg-primary" />
          )}
        </button>
        <button
          type="button"
          onClick={handleMinimize}
          title={String(t("titlebar.minimize"))}
          className="w-10 h-full flex items-center justify-center text-on-surface-variant hover:bg-on-surface/[0.08] hover:text-on-surface rounded-none transition-colors"
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          title={isMaximized ? String(t("titlebar.restore")) : String(t("titlebar.maximize"))}
          className="w-10 h-full flex items-center justify-center text-on-surface-variant hover:bg-on-surface/[0.08] hover:text-on-surface rounded-none transition-colors"
        >
          {isMaximized ? <Copy size={14} /> : <Square size={14} />}
        </button>
        <button
          type="button"
          onClick={handleClose}
          title={String(t("titlebar.close"))}
          className="w-10 h-full flex items-center justify-center text-on-surface-variant hover:bg-error hover:text-on-error rounded-none transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <TaskPanel open={taskPanelOpen} onClose={() => setTaskPanelOpen(false)} />
    </div>
  );
}
