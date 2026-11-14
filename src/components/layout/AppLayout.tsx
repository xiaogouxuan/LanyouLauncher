import { Outlet } from "react-router-dom";
import { useState, useEffect } from "react";
import { Titlebar } from "./Titlebar";
import { BottomNav } from "./BottomNav";
import { ContentArea } from "./ContentArea";
import { CommandPalette } from "./CommandPalette";
import { TaskPanel } from "@/components/task/TaskPanel";

export function AppLayout() {
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // 全局快捷键：Ctrl+K 打开命令面板
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="relative isolate h-full flex flex-col rounded-window overflow-hidden bg-surface ring-1 ring-inset ring-outline-variant">
      {/* 壁纸背景层：位于所有内容之下，避免影响 fixed 弹窗定位 */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-300"
          style={{
            backgroundImage: "var(--background-image)",
            backgroundColor: "var(--background-solid)",
            opacity: "var(--background-opacity)",
            filter: "blur(var(--background-blur))",
          }}
        />
      </div>

      <Titlebar
        onOpenTasks={() => setTaskPanelOpen(true)}
        onOpenSearch={() => setPaletteOpen(true)}
      />
      <div className="flex-1 flex overflow-hidden relative">
        <ContentArea>
          <Outlet />
        </ContentArea>
        <TaskPanel open={taskPanelOpen} onClose={() => setTaskPanelOpen(false)} />
      </div>
      <BottomNav />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
