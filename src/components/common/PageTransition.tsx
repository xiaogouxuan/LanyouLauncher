import { type ReactNode } from "react";
import { useLocation } from "react-router-dom";

interface PageTransitionProps {
  children: ReactNode;
  /** 保留旧用法兼容，实际动效按当前路由自动选择 */
  variant?: "focus" | "slide";
}

type MotionName =
  | "home"
  | "cascade"
  | "drawer"
  | "tiles"
  | "cards"
  | "signal"
  | "rows"
  | "soft";

/**
 * 每个页面使用各自独立的入场动效，避免全站都是同一套淡入：
 * - 首页：整体托起，问候语横向刷出，面板弹性上浮，推荐卡片左右交替落位
 * - 版本列表：标题下落，筛选行从左侧错峰滑入，卡片依次上浮
 * - 版本/Mod 详情：从右侧抽屉式推入，内部区块向右错峰展开
 * - Mod 列表：像瓷砖一样从下方带轻微旋转弹入
 * - 账号：卡片以 3D 翻转方式落位
 * - 联机：状态面板带回一圈声呐扩散
 * - 设置：条目从右侧逐行滑入
 */
function resolveMotion(pathname: string): MotionName {
  if (pathname === "/") return "home";
  if (pathname === "/versions") return "cascade";
  if (pathname.startsWith("/versions/")) return "drawer";
  if (pathname === "/mods") return "tiles";
  if (pathname.startsWith("/mods/")) return "drawer";
  if (pathname === "/accounts") return "cards";
  if (pathname === "/multiplayer") return "signal";
  if (pathname === "/settings") return "rows";
  return "soft";
}

export function PageTransition({ children }: PageTransitionProps) {
  const { pathname } = useLocation();
  const motion = resolveMotion(pathname);

  return (
    <div className={`page-transition motion-${motion}`} data-motion={motion}>
      {children}
    </div>
  );
}
