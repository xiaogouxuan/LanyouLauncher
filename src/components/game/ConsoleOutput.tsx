import { useEffect, useRef } from "react";
import { X, Terminal } from "lucide-react";
import { useLaunchStore } from "@/stores/launchStore";
import { useUIStore } from "@/stores/uiStore";
import { useTranslation } from "@/i18n";

const levelColors: Record<string, string> = {
  info: "text-on-surface-variant",
  warn: "text-tertiary",
  error: "text-error",
};

export function ConsoleOutput() {
  const { t } = useTranslation();
  const { logs, isRunning } = useLaunchStore();
  const { consoleVisible, toggleConsole } = useUIStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (!consoleVisible) return null;

  return (
    <div className="h-48 border-t border-outline-variant bg-surface-container-high flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-outline-variant bg-surface-container">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-on-surface-variant" />
          <span className="text-xs font-medium text-on-surface">
            {t("launch.console")}
          </span>
          {isRunning && (
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => useLaunchStore.getState().clearLogs()}
            className="text-xs text-on-surface-variant hover:text-on-surface px-2 py-1 rounded transition-colors"
          >
            {t("launch.clearConsole")}
          </button>
          <button
            onClick={toggleConsole}
            className="p-1 rounded hover:bg-on-surface/[0.08] text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 ? (
          <p className="text-on-surface-variant/50">
            {t("common.noData")}
          </p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={levelColors[log.level] || "text-on-surface-variant"}>
              <span className="text-on-surface-variant/50 mr-2">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              {log.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
