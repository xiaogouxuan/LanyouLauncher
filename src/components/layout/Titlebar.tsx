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
      className="h-10 flex items-center justify-between bg-shell border-b border-primary/45 select-none shrink-0 relative"
      onDoubleClick={handleMaximize}
    >
      {/* 左侧：品牌与拖拽区域 */}
      <div data-tauri-drag-region className="flex items-center gap-2.5 pl-3 h-full flex-1 min-w-0">
        <div className="w-6 h-6 rounded-[4px] border border-outline-variant bg-surface-high p-[1px]">
          <img
            src={logoUrl}
            alt="logo"
            className="w-full h-full rounded-[3px] object-contain"
          />
        </div>
        <span className="text-[13px] font-semibold tracking-tight truncate text-on-surface">
          {APP_NAME}
        </span>
      </div>

      {/* 中间：搜索入口 */}
      <button
        type="button"
        onClick={onOpenSearch}
        className="no-drag hidden md:flex items-center gap-2 h-7 w-[300px] px-2.5 rounded-[4px]
          bg-surface-high border border-outline-variant text-on-surface-subtle
          hover:border-primary/40 hover:text-on-surface-variant transition-colors duration-150"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <Search size={13} className="text-on-surface-subtle" />
        <span className="text-[12px] flex-1 text-left truncate">{t("more.paletteHint")}</span>
        <kbd className="text-[10px] px-1.5 py-0.5 rounded-[3px] border border-outline-variant bg-surface-container text-on-surface-subtle">
          {t("more.shortcutHint")}
        </kbd>
      </button>

      {/* 右侧：任务与窗口控制 */}
      <div
        className="flex h-full flex-1 justify-end"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={onOpenTasks}
          title={String(t("titlebar.tasks"))}
          className="relative w-10 h-full flex items-center justify-center text-on-surface-variant
            hover:bg-surface-hover hover:text-on-surface transition-colors"
        >
          <ListTodo size={16} />
          {activeTaskCount > 0 && (
            <span className="absolute top-[9px] right-[11px] w-[6px] h-[6px] rounded-[2px] bg-primary" />
          )}
        </button>
        <button
          type="button"
          onClick={handleMinimize}
          title={String(t("titlebar.minimize"))}
          className="w-10 h-full flex items-center justify-center text-on-surface-variant
            hover:bg-surface-hover hover:text-on-surface transition-colors"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          title={isMaximized ? String(t("titlebar.restore")) : String(t("titlebar.maximize"))}
          className="w-10 h-full flex items-center justify-center text-on-surface-variant
            hover:bg-surface-hover hover:text-on-surface transition-colors"
        >
          {isMaximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          type="button"
          onClick={handleClose}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title={String(t("titlebar.close"))}
          className="w-10 h-full flex items-center justify-center text-on-surface-variant
            hover:bg-danger hover:text-white transition-colors"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
