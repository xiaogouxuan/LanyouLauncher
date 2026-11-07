import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** 主界面入场（与 splash 衔接）的触发信号 */
export const REVEAL_EVENT = "lanyou:reveal";

/**
 * 启动遮罩：窗口先是 200×200 的透明小窗，只显示一枚放大的 Logo。
 * Logo 先自然收尾（淡出到位），再恢复主界面尺寸，最后主界面从下方滑入，
 * 全程不出现“图标跟着窗口闪一下”这类割裂感。
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<"in" | "out" | "gone">("in");

  useEffect(() => {
    // Logo 先淡出（图标完全消失后才动窗口）
    const fadeOut = window.setTimeout(() => setPhase("out"), 900);
    const gone = window.setTimeout(() => setPhase("gone"), 1180);

    // 图标结束后再把窗口放大到主界面尺寸，然后让主界面滑入
    const grow = window.setTimeout(() => {
      invoke("finish_splash")
        .catch(() => {})
        .finally(() => window.dispatchEvent(new CustomEvent(REVEAL_EVENT)));
    }, 1200);

    return () => {
      window.clearTimeout(fadeOut);
      window.clearTimeout(gone);
      window.clearTimeout(grow);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      className={`fixed inset-0 z-[999] flex items-center justify-center pointer-events-none transition-opacity duration-[260ms] ease-in ${
        phase === "out" ? "opacity-0" : "opacity-100"
      }`}
    >
      <img src="/logo.png" alt="" className="w-[104px] h-[104px] object-contain splash-logo" />
    </div>
  );
}

/** 主界面入场：等窗口恢复尺寸后，像卷帘一样从下方掀起，全程不透明，不会有桌面透出来的破面 */
export function AppReveal({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const reveal = () => setShown(true);
    window.addEventListener(REVEAL_EVENT, reveal);
    // 兜底：即使没收到信号，也要保证界面能出现
    const fallback = window.setTimeout(reveal, 2400);
    return () => {
      window.removeEventListener(REVEAL_EVENT, reveal);
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <div
      className={`h-full w-full transition-[clip-path,transform] duration-[440ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        shown
          ? "translate-y-0 [clip-path:inset(0_0_0_0)]"
          : "translate-y-[10px] [clip-path:inset(100%_0_0_0)]"
      }`}
    >
      {children}
    </div>
  );
}
