import { Outlet } from "react-router-dom";
import { Titlebar } from "./Titlebar";
import { Sidebar } from "./Sidebar";
import { ContentArea } from "./ContentArea";

export function AppLayout() {
  return (
    <div className="relative h-full flex flex-col rounded-window overflow-hidden bg-surface ring-1 ring-inset ring-outline/20">
      {/* 背景图层：直接展示壁纸，支持透明度和模糊调节 */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-300"
        style={{
          backgroundImage: "var(--background-image)",
          opacity: "var(--background-opacity)",
          filter: "blur(var(--background-blur))",
        }}
      />

      <div className="relative z-10 flex flex-col h-full">
        <Titlebar />
        <div className="flex-1 flex overflow-hidden">
          <Sidebar />
          <ContentArea>
            <Outlet />
          </ContentArea>
        </div>
      </div>
    </div>
  );
}
