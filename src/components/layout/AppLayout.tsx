import { Outlet } from "react-router-dom";
import { useState } from "react";
import { Titlebar } from "./Titlebar";
import { Sidebar } from "./Sidebar";
import { ContentArea } from "./ContentArea";
import { TaskPanel } from "@/components/task/TaskPanel";

export function AppLayout() {
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);

  return (
    <div className="relative h-full flex flex-col rounded-window overflow-hidden bg-surface ring-1 ring-inset ring-outline/20">
      <Titlebar onOpenTasks={() => setTaskPanelOpen(true)} />
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar />
        <ContentArea>
          <Outlet />
        </ContentArea>
        <TaskPanel open={taskPanelOpen} onClose={() => setTaskPanelOpen(false)} />
      </div>
    </div>
  );
}
