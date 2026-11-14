import React, { useState, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X, ListTodo, Search } from "lucide-react";
import { useTranslation } from "@/i18n";
import { APP_NAME } from "@/utils/constants";
import { useTaskStore } from "@/stores/taskStore";

const logoUrl = new URL("/logo.png", import.meta.url).href;

interface TitlebarProps {
  onOpenTasks: () => void;
  onOpenSearch: () => void;
}

/**
 * 顶部栏：不设底板与描边，直接悬浮在壁纸上，
 * 只保留应用标识与右侧的操作按钮，颜色随壁纸亮度自动反色。
 */
export function Titlebar({ onOpenTasks, onOpenSearch }: TitlebarProps) {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);
  const activeTaskCount = useTaskStore((s) =>
    s.tasks.filter((task) => task.status === "running" || task.status === "pending").length
  );

  useEffect(() => {
    const win = getCurrentWindow();
    const check = async () => {
      try {
        setIsMaximized(await win.isMaximized());
      } catch {
        // 忽略：非 Tauri 环境
      }
    };
    check();

    let unlisten: (() => void) | undefined;
    win
      .onResized?.(() => check())
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});

    return () => {
      unlisten?.();
    };
  }, []);

  const handleMinimize = useCallback(async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (error) {
      console.error("minimize failed", error);
    }
  }, []);

  const handleMaximize = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      await win.toggleMaximize();
      setIsMaximized(await win.isMaximized());
    } catch (error) {
      console.error("maximize failed", error);
    }
  }, []);

  const handleClose = useCallback(async () => {
    try {
      await getCurrentWindow().close();
    } catch (error) {
      console.error("close failed", error);
      window.close();
    }
  }, []);

  return (
    <div
      className="h-11 flex items-center justify-between select-none shrink-0 relative"
      onDoubleClick={handleMaximize}
    >
      {/* 左侧：应用标识与拖拽区域 */}
      <div data-tauri-drag-region className="flex items-center gap-2 pl-4 h-full flex-1 min-w-0">
        <img src={logoUrl} alt="" className="w-[22px] h-[22px] object-contain" />
        <span className="wallpaper-text text-[13px] font-semibold tracking-tight truncate">
          {APP_NAME}
        </span>
      </div>

      {/* 右侧：搜索、任务与窗口控制 */}
      <div
        className="flex h-full items-center gap-0.5 pr-1"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={onOpenSearch}
          title={String(t("more.paletteHint"))}
          className="chrome-btn"
        >
          <Search size={15} />
        </button>
        <button
          type="button"
          onClick={onOpenTasks}
          title={String(t("titlebar.tasks"))}
          className="chrome-btn relative"
        >
          <ListTodo size={15} />
          {activeTaskCount > 0 && (
            <span className="absolute top-[5px] right-[5px] w-[5px] h-[5px] rounded-full bg-primary" />
          )}
        </button>

        <button
          type="button"
          onClick={handleMinimize}
          title={String(t("titlebar.minimize"))}
          className="chrome-win"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          title={isMaximized ? String(t("titlebar.restore")) : String(t("titlebar.maximize"))}
          className="chrome-win"
        >
          {isMaximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          type="button"
          onClick={handleClose}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title={String(t("titlebar.close"))}
          className="chrome-win chrome-win-close"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
