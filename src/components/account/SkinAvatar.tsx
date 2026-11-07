import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { drawHeadFromSkin, loadImage, loadSkinForAccount } from "@/services/skinCache";
import type { Account } from "@/types/account";

interface SkinAvatarProps {
  account: Account | null;
  size?: number;
  className?: string;
  rounded?: "full" | "xl" | "lg" | "none";
}

/**
 * Minecraft 风格头像：从皮肤纹理裁切脸层与帽子层，不整图缩放，避免“整张皮肤塞进头像”的穿帮。
 */
export function SkinAvatar({ account, size = 40, className = "", rounded = "xl" }: SkinAvatarProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    const render = async () => {
      const target: Account = account ?? {
        id: "00000000-0000-0000-0000-000000000000",
        username: "Player",
        account_type: "Offline",
        avatar_url: null,
        skin_path: null,
        access_token: null,
        refresh_token: null,
        expires_at: null,
        is_active: false,
        auth_server: null,
      };

      try {
        const img = await loadSkinForAccount(target);
        if (cancelled) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) {
          setStatus("fallback");
          return;
        }
        const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
        drawHeadFromSkin(ctx, img, canvas.width);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("fallback");
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [account, size]);

  const radiusClass =
    rounded === "full"
      ? "rounded-full"
      : rounded === "none"
        ? "rounded-none"
        : rounded === "lg"
          ? "rounded-lg"
          : "rounded-xl";

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative ${radiusClass} overflow-hidden bg-surface-container ${className}`}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        aria-label={String(t("account.avatarAlt"))}
        className={`absolute inset-0 w-full h-full pixelated transition-opacity duration-150 ${
          status === "ready" ? "opacity-100" : "opacity-0"
        }`}
      />
      {status !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/12">
          {status === "fallback" ? (
            <span
              className="font-bold text-primary"
              style={{ fontSize: Math.max(10, size * 0.42) }}
            >
              {(account?.username ?? "?").slice(0, 1).toUpperCase()}
            </span>
          ) : (
            <span className="block w-1/2 h-1/2 rounded-md bg-white/30 animate-pulse" />
          )}
        </div>
      )}
    </div>
  );
}
