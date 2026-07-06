import { type ReactNode } from "react";

interface ContentAreaProps {
  children: ReactNode;
}

export function ContentArea({ children }: ContentAreaProps) {
  return (
    <main className="relative flex-1 overflow-y-auto overflow-x-hidden isolate">
      {/* 背景图层：只在内容区展示壁纸 */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-300 -z-10"
        style={{
          backgroundImage: "var(--background-image)",
          opacity: "var(--background-opacity)",
          filter: "blur(var(--background-blur))",
        }}
      />

      <div className="relative z-0 min-h-full">
        {children}
      </div>
    </main>
  );
}
