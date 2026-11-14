import { type ReactNode, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

interface ContentAreaProps {
  children: ReactNode;
}

/**
 * 内容区：所有页面都完整透出壁纸，与首页保持完全一致的色彩与透明度。
 * 页面内容统一顶到最上方；壁纸顶部的 logo 只在首页展示，其余页面不再为它预留高度。
 * 切换路由时把滚动位置归零，避免新页面从中段开始显示。
 */
export function ContentArea({ children }: ContentAreaProps) {
  const location = useLocation();
  const scrollRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <main ref={scrollRef} className="relative flex-1 overflow-y-auto overflow-x-hidden isolate">
      <div className="relative z-[1] flex min-h-full flex-col">{children}</div>
    </main>
  );
}
