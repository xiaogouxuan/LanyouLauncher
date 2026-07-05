import { useEffect, useRef, useState, useCallback } from "react";
import { accountService } from "@/services/accountService";
import { getCachedSkin, cacheSkin } from "@/services/skinCache";
import type { Account } from "@/types/account";

interface SkinAvatarProps {
  account: Account | null;
  size?: number;
  className?: string;
}

/**
 * 从皮肤纹理中绘制 Minecraft 风格头像（8x8 脸 + 8x8 帽子层）
 * 与 HMCL TexturesLoader.drawAvatar() 算法一致
 */
function drawHeadFromSkin(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  size: number,
) {
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;

  const scale = img.naturalWidth / 64;
  const faceInset = Math.round(size / 18);

  // 脸层 (8,8, 8x8)
  ctx.drawImage(
    img,
    8 * scale, 8 * scale, 8 * scale, 8 * scale,
    faceInset, faceInset,
    size - 2 * faceInset, size - 2 * faceInset,
  );

  // 帽子层 (40,8, 8x8)
  if (img.naturalHeight >= 64 * scale) {
    ctx.drawImage(
      img,
      40 * scale, 8 * scale, 8 * scale, 8 * scale,
      0, 0, size, size,
    );
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!url.startsWith("data:image/")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load failed"));
    img.src = url;
  });
}

async function loadSkinForAvatar(account: Account): Promise<HTMLImageElement | null> {
  // 1. 本地自定义皮肤优先（base64 兜底）
  if (account.skin_path) {
    try {
      const dataUrl = await accountService.readSkinDataUrl(account.skin_path);
      return await loadImage(dataUrl);
    } catch (err) {
      console.warn("[SkinAvatar] base64 read failed:", err);
    }
  }

  // 2. 在线 API 作为备用
  const uuid = account.id.replace(/-/g, "");
  const urls = [
    `https://crafatar.com/skins/${uuid}`,
    `https://mc-heads.net/skin/${uuid}`,
    `https://visage.surgeplay.com/skin/${uuid}`,
  ];
  for (const url of urls) {
    try {
      return await loadImage(url);
    } catch {
      continue;
    }
  }

  return null;
}

export function SkinAvatar({ account, size = 40, className = "" }: SkinAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "canvas" | "fallback">("loading");

  const drawHead = useCallback(
    (skinImg: HTMLImageElement) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (skinImg.naturalWidth < 64 || skinImg.naturalHeight < 32) {
        setStatus("fallback");
        return;
      }

      drawHeadFromSkin(ctx, skinImg, size);
      setStatus("canvas");
    },
    [size],
  );

  useEffect(() => {
    if (!account) {
      setStatus("fallback");
      return;
    }

    setStatus("loading");
    let cancelled = false;

    const cached = getCachedSkin(account.id);
    if (cached?.headDataUrl) {
      const img = new Image();
      img.onload = () => {
        if (!cancelled) drawHead(img);
      };
      img.onerror = () => setStatus("fallback");
      img.src = cached.headDataUrl;
      return;
    }

    (async () => {
      const img = await loadSkinForAvatar(account);
      if (!img || cancelled) {
        if (!cancelled) setStatus("fallback");
        return;
      }
      if (!cancelled) {
        cacheSkin(account.id, img);
        drawHead(img);
      }
    })();

    return () => { cancelled = true; };
  }, [account, drawHead]);

  // 无账号
  if (!account) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-full bg-surface-container flex items-center justify-center ring-2 ring-surface/80 ${className}`}
      >
        <span className="text-xs font-semibold text-on-surface-variant select-none">
          ?
        </span>
      </div>
    );
  }

  const initial = account.username.charAt(0).toUpperCase();

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative rounded-full overflow-hidden ring-2 ring-surface/80 bg-surface-container ${className}`}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className={`absolute inset-0 w-full h-full pixelated ${status === "canvas" ? "opacity-100" : "opacity-0"}`}
      />
      {status !== "canvas" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-semibold text-on-surface-variant select-none">
            {initial}
          </span>
        </div>
      )}
    </div>
  );
}
