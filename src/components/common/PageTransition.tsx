import { type ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  /**
   * focus：普通页面，原位轻微聚焦淡入
   * slide：详情类页面，从右侧短距离滑入，像从列表里打开一层内容
   */
  variant?: "focus" | "slide";
}

export function PageTransition({ children, variant = "focus" }: PageTransitionProps) {
  return <div className={`page-transition page-transition-${variant}`}>{children}</div>;
}
