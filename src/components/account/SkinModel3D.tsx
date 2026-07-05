import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { accountService } from "@/services/accountService";
import { getCachedSkin, cacheSkin } from "@/services/skinCache";
import { useTranslation } from "@/i18n";
import type { Account } from "@/types/account";

// ============================================================
// 皮肤纹理加载 & Slim 模型检测
// ============================================================

interface SkinModel3DProps {
  account: Account | null;
  size?: number;
  className?: string;
}

const TEX_SCALE = 4; // 256x256 纹理，64x64 UV 坐标 * 4

/** 尝试加载皮肤纹理，优先本地文件，其次在线 API */
async function loadSkinTexture(account: Account): Promise<HTMLImageElement | null> {
  // 1. 本地自定义皮肤优先（base64 兜底，避免 convertFileSrc 在某些路径失败）
  if (account.skin_path) {
    try {
      const dataUrl = await accountService.readSkinDataUrl(account.skin_path);
      return await loadImage(dataUrl);
    } catch (err) {
      console.warn("[SkinModel3D] base64 read failed:", err);
    }
  }

  // 2. 在线 API
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

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!url.startsWith("data:image/") && !url.startsWith("https://asset.localhost/")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load failed"));
    img.src = url;
  });
}

/**
 * 基于皮肤像素检测是否为 Alex（slim）模型
 * 与 HMCL NormalizedSkin.isSlim() 一致：
 *   检查右臂/左臂边缘是否有透明/黑色像素
 */
function detectSlimFromPixels(img: HTMLImageElement): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  ctx.drawImage(img, 0, 0);
  const scale = img.naturalWidth / 64;

  const hasTransparency = (x: number, y: number, w: number, h: number): boolean => {
    for (let dy = 0; dy < h * scale; dy++) {
      for (let dx = 0; dx < w * scale; dx++) {
        const px = ctx.getImageData(
          Math.floor(x * scale + dx),
          Math.floor(y * scale + dy),
          1, 1,
        ).data;
        if (px[3] < 255) return true;
      }
    }
    return false;
  };

  const isBlack = (x: number, y: number, w: number, h: number): boolean => {
    for (let dy = 0; dy < h * scale; dy++) {
      for (let dx = 0; dx < w * scale; dx++) {
        const px = ctx.getImageData(
          Math.floor(x * scale + dx),
          Math.floor(y * scale + dy),
          1, 1,
        ).data;
        if (!(px[0] === 0 && px[1] === 0 && px[2] === 0 && px[3] === 255)) return false;
      }
    }
    return true;
  };

  if (hasTransparency(50, 16, 2, 4) || hasTransparency(54, 20, 2, 12) ||
      hasTransparency(42, 48, 2, 4) || hasTransparency(46, 52, 2, 12)) {
    return true;
  }
  if (isBlack(50, 16, 2, 4) && isBlack(54, 20, 2, 12) &&
      isBlack(42, 48, 2, 4) && isBlack(46, 52, 2, 12)) {
    return true;
  }
  return false;
}

/**
 * 将任意尺寸的皮肤纹理规范化为 256x256，保持像素清晰（nearest neighbor）
 * 64x32 旧版皮肤会在下半部分留白，不会被拉伸。
 */
function normalizeSkinTexture(img: HTMLImageElement): string {
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const legacy = srcH < srcW; // 64x32 等旧版皮肤

  const temp = document.createElement("canvas");
  temp.width = 64;
  temp.height = 64;
  const tctx = temp.getContext("2d");
  if (!tctx) return img.src;
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(img, 0, 0, 64, legacy ? 32 : 64);

  const out = document.createElement("canvas");
  out.width = 256;
  out.height = 256;
  const octx = out.getContext("2d");
  if (!octx) return img.src;
  octx.imageSmoothingEnabled = false;
  octx.drawImage(temp, 0, 0, 256, 256);

  return out.toDataURL("image/png");
}

// ============================================================
// UV 贴图坐标（Minecraft 64x64 标准皮肤布局）
// 格式：[x, y, w, h]（单位：Minecraft 像素）
// ============================================================

type UV = [number, number, number, number];

interface CubeUV {
  top: UV; bottom: UV;
  right: UV; front: UV; left: UV; back: UV;
}

const HEAD: CubeUV = {
  top: [8, 0, 8, 8], bottom: [16, 0, 8, 8],
  right: [0, 8, 8, 8], front: [8, 8, 8, 8],
  left: [16, 8, 8, 8], back: [24, 8, 8, 8],
};
const HEAD_HAT: CubeUV = {
  top: [40, 0, 8, 8], bottom: [48, 0, 8, 8],
  right: [32, 8, 8, 8], front: [40, 8, 8, 8],
  left: [48, 8, 8, 8], back: [56, 8, 8, 8],
};

const BODY: CubeUV = {
  top: [20, 16, 8, 4], bottom: [28, 16, 8, 4],
  right: [16, 20, 4, 12], front: [20, 20, 8, 12],
  left: [28, 20, 4, 12], back: [32, 20, 8, 12],
};
const BODY_OVERLAY: CubeUV = {
  top: [20, 32, 8, 4], bottom: [28, 32, 8, 4],
  right: [16, 36, 4, 12], front: [20, 36, 8, 12],
  left: [28, 36, 4, 12], back: [32, 36, 8, 12],
};

const RARM: CubeUV = {
  top: [44, 16, 4, 4], bottom: [48, 16, 4, 4],
  right: [40, 20, 4, 12], front: [44, 20, 4, 12],
  left: [48, 20, 4, 12], back: [52, 20, 4, 12],
};
const RARM_OVERLAY: CubeUV = {
  top: [44, 32, 4, 4], bottom: [48, 32, 4, 4],
  right: [40, 36, 4, 12], front: [44, 36, 4, 12],
  left: [48, 36, 4, 12], back: [52, 36, 4, 12],
};

const LARM: CubeUV = {
  top: [36, 48, 4, 4], bottom: [40, 48, 4, 4],
  right: [32, 52, 4, 12], front: [36, 52, 4, 12],
  left: [40, 52, 4, 12], back: [44, 52, 4, 12],
};
const LARM_OVERLAY: CubeUV = {
  top: [52, 48, 4, 4], bottom: [56, 48, 4, 4],
  right: [48, 52, 4, 12], front: [52, 52, 4, 12],
  left: [56, 52, 4, 12], back: [60, 52, 4, 12],
};

const RLEG: CubeUV = {
  top: [4, 16, 4, 4], bottom: [8, 16, 4, 4],
  right: [0, 20, 4, 12], front: [4, 20, 4, 12],
  left: [8, 20, 4, 12], back: [12, 20, 4, 12],
};
const RLEG_OVERLAY: CubeUV = {
  top: [4, 32, 4, 4], bottom: [8, 32, 4, 4],
  right: [0, 36, 4, 12], front: [4, 36, 4, 12],
  left: [8, 36, 4, 12], back: [12, 36, 4, 12],
};

const LLEG: CubeUV = {
  top: [20, 48, 4, 4], bottom: [24, 48, 4, 4],
  right: [16, 52, 4, 12], front: [20, 52, 4, 12],
  left: [24, 52, 4, 12], back: [28, 52, 4, 12],
};
const LLEG_OVERLAY: CubeUV = {
  top: [4, 48, 4, 4], bottom: [8, 48, 4, 4],
  right: [0, 52, 4, 12], front: [4, 52, 4, 12],
  left: [8, 52, 4, 12], back: [12, 52, 4, 12],
};

const RARM_SLIM: CubeUV = {
  top: [44, 16, 3, 4], bottom: [47, 16, 3, 4],
  right: [40, 20, 4, 12], front: [44, 20, 3, 12],
  left: [47, 20, 4, 12], back: [51, 20, 3, 12],
};
const RARM_SLIM_OVERLAY: CubeUV = {
  top: [44, 32, 3, 4], bottom: [47, 32, 3, 4],
  right: [40, 36, 4, 12], front: [44, 36, 3, 12],
  left: [47, 36, 4, 12], back: [51, 36, 3, 12],
};
const LARM_SLIM: CubeUV = {
  top: [36, 48, 3, 4], bottom: [39, 48, 3, 4],
  right: [32, 52, 4, 12], front: [36, 52, 3, 12],
  left: [39, 52, 4, 12], back: [43, 52, 3, 12],
};
const LARM_SLIM_OVERLAY: CubeUV = {
  top: [52, 48, 3, 4], bottom: [55, 48, 3, 4],
  right: [48, 52, 4, 12], front: [52, 52, 3, 12],
  left: [55, 52, 4, 12], back: [59, 52, 3, 12],
};

// ============================================================
// 3D Cube 组件
// ============================================================

interface CubeProps {
  skinUrl: string;
  cx: number; cy: number; cz: number;
  w: number; h: number; d: number;
  uv: CubeUV;
  outer?: boolean;
}

function CubeFace({ uvRect, w, h, transform, skinUrl }: {
  uvRect: UV; w: number; h: number; transform: string; skinUrl: string;
}) {
  return (
    <div
      className="absolute pixelated"
      style={{
        width: w,
        height: h,
        left: -w / 2,
        top: -h / 2,
        backgroundImage: `url(${skinUrl})`,
        backgroundSize: `${64 * TEX_SCALE}px ${64 * TEX_SCALE}px`,
        backgroundPosition: `${-uvRect[0] * TEX_SCALE}px ${-uvRect[1] * TEX_SCALE}px`,
        backgroundRepeat: "no-repeat",
        transform,
        backfaceVisibility: "hidden",
      }}
    />
  );
}

function Cube({ skinUrl, cx, cy, cz, w, h, d, uv, outer }: CubeProps) {
  const scale = outer ? 1.05 : 1;
  const ow = w * scale;
  const oh = h * scale;
  const od = d * scale;

  const faces = useMemo(() => [
    { w: ow, h: oh, t: `translateZ(${od / 2}px)`, uv: uv.front },
    { w: ow, h: oh, t: `rotateY(180deg) translateZ(${od / 2}px)`, uv: uv.back },
    { w: od, h: oh, t: `rotateY(90deg) translateZ(${ow / 2}px)`, uv: uv.right },
    { w: od, h: oh, t: `rotateY(-90deg) translateZ(${ow / 2}px)`, uv: uv.left },
    { w: ow, h: od, t: `rotateX(90deg) translateZ(${oh / 2}px)`, uv: uv.top },
    { w: ow, h: od, t: `rotateX(-90deg) translateZ(${oh / 2}px)`, uv: uv.bottom },
  ], [ow, oh, od, uv]);

  return (
    <div
      className="absolute"
      style={{
        transformStyle: "preserve-3d",
        transform: `translate3d(${cx}px, ${cy}px, ${cz}px)`,
      }}
    >
      {faces.map((face, i) => (
        <CubeFace key={i} uvRect={face.uv} w={face.w} h={face.h} transform={face.t} skinUrl={skinUrl} />
      ))}
    </div>
  );
}

function BodyPart({
  skinUrl, cx, cy, cz, w, h, d, uvInner, uvOuter,
}: {
  skinUrl: string; cx: number; cy: number; cz: number;
  w: number; h: number; d: number;
  uvInner: CubeUV; uvOuter: CubeUV;
}) {
  return (
    <>
      <Cube skinUrl={skinUrl} cx={cx} cy={cy} cz={cz} w={w} h={h} d={d} uv={uvInner} />
      <Cube skinUrl={skinUrl} cx={cx} cy={cy} cz={cz} w={w} h={h} d={d} uv={uvOuter} outer />
    </>
  );
}

// ============================================================
// 完整皮肤模型
// ============================================================

export function SkinModel3D({ account, size = 96, className = "" }: SkinModel3DProps) {
  const { t } = useTranslation();
  const [skinUrl, setSkinUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [isSlim, setIsSlim] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState({ x: -10, y: 30 });
  const [isDragging, setIsDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!account) {
      setStatus("error");
      return;
    }

    setStatus("loading");
    let cancelled = false;

    const cached = getCachedSkin(account.id);
    if (cached) {
      setSkinUrl(cached.skinDataUrl);
      setIsSlim(cached.isSlim);
      setStatus("loaded");
      return;
    }

    (async () => {
      const img = await loadSkinTexture(account);
      if (!img || cancelled) {
        if (!cancelled) setStatus("error");
        return;
      }

      const slim = detectSlimFromPixels(img);
      const normalized = normalizeSkinTexture(img);
      if (!cancelled) {
        cacheSkin(account.id, img);
        setSkinUrl(normalized);
        setIsSlim(slim);
        setStatus("loaded");
      }
    })();

    return () => { cancelled = true; };
  }, [account]);

  // 鼠标/触摸交互
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      setIsDragging(true);
      lastPos.current = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };

      setRotation((r) => ({
        x: Math.max(-90, Math.min(90, r.x - dy * 0.5)),
        y: (r.y + dx * 0.5) % 360,
      }));
    };

    const onPointerUp = () => setIsDragging(false);

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointerleave", onPointerUp);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointerleave", onPointerUp);
    };
  }, [isDragging]);

  if (!account || status === "error") {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-2xl bg-surface-container flex items-center justify-center ring-2 ring-surface/80 shadow-md ${className}`}
      >
        <span className="text-xs text-on-surface-variant select-none">
          {t("account.skinModelSteve")}
        </span>
      </div>
    );
  }

  const armW = isSlim ? 3 : 4;
  const px = TEX_SCALE;

  // 模型总高度 = 头(8) + 身体(12) + 腿(12) = 32 个 Minecraft 像素
  const modelHeightPx = 32 * px;
  const modelScale = (size * 0.82) / modelHeightPx;
  const centerX = size / 2;
  const centerY = size * 0.5 + 2 * px * modelScale;

  const cursorClass = isDragging ? "cursor-grabbing" : "cursor-grab";

  return (
    <div
      ref={wrapperRef}
      style={{ width: size, height: size, perspective: 800 }}
      className={`relative rounded-2xl bg-surface-container overflow-hidden ring-2 ring-surface/80 shadow-md select-none touch-none ${cursorClass} ${className}`}
      title={isSlim ? t("account.skinModelAlex") : t("account.skinModelSteve")}
    >
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-container animate-pulse">
          <span className="text-xs text-on-surface-variant select-none">
            {t("account.skinModelSteve")}
          </span>
        </div>
      )}

      {skinUrl && status === "loaded" && (
        <div
          className="absolute"
          style={{
            width: 0, height: 0, left: 0, top: 0,
            transformStyle: "preserve-3d",
            transform: `translate(${centerX}px, ${centerY}px) scale(${modelScale}) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
          }}
        >
          {/* 头部 */}
          <BodyPart
            skinUrl={skinUrl}
            cx={0} cy={-10 * px} cz={0}
            w={8 * px} h={8 * px} d={8 * px}
            uvInner={HEAD} uvOuter={HEAD_HAT}
          />

          {/* 身体 */}
          <BodyPart
            skinUrl={skinUrl}
            cx={0} cy={0} cz={0}
            w={8 * px} h={12 * px} d={4 * px}
            uvInner={BODY} uvOuter={BODY_OVERLAY}
          />

          {/* 右臂 */}
          <BodyPart
            skinUrl={skinUrl}
            cx={-(4 + armW / 2) * px} cy={0} cz={0}
            w={armW * px} h={12 * px} d={4 * px}
            uvInner={isSlim ? RARM_SLIM : RARM}
            uvOuter={isSlim ? RARM_SLIM_OVERLAY : RARM_OVERLAY}
          />

          {/* 左臂 */}
          <BodyPart
            skinUrl={skinUrl}
            cx={(4 + armW / 2) * px} cy={0} cz={0}
            w={armW * px} h={12 * px} d={4 * px}
            uvInner={isSlim ? LARM_SLIM : LARM}
            uvOuter={isSlim ? LARM_SLIM_OVERLAY : LARM_OVERLAY}
          />

          {/* 右腿 */}
          <BodyPart
            skinUrl={skinUrl}
            cx={-2 * px} cy={12 * px} cz={0}
            w={4 * px} h={12 * px} d={4 * px}
            uvInner={RLEG} uvOuter={RLEG_OVERLAY}
          />

          {/* 左腿 */}
          <BodyPart
            skinUrl={skinUrl}
            cx={2 * px} cy={12 * px} cz={0}
            w={4 * px} h={12 * px} d={4 * px}
            uvInner={LLEG} uvOuter={LLEG_OVERLAY}
          />
        </div>
      )}
    </div>
  );
}
