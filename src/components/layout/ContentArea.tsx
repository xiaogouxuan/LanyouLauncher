import { type ReactNode } from "react";

interface ContentAreaProps {
  children: ReactNode;
}

/**
 * 内容区：所有页面都完整透出壁纸，与首页保持完全一致的色彩与透明度。
 * 页面内容统一顶到最上方；壁纸顶部的 logo 只在首页展示，其余页面不再为它预留高度。
 */
export function ContentArea({ children }: ContentAreaProps) {
  return (
    <main className="relative flex-1 overflow-y-auto overflow-x-hidden isolate">
      <div className="relative z-[1] min-h-full">{children}</div>
    </main>
  );
}
