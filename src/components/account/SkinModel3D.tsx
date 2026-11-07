import { useEffect, useRef, useState } from "react";
import { User } from "lucide-react";
import {
  cacheSkin,
  detectSlimFromImage,
  getCachedSkin,
  loadImage,
  loadSkinForAccount,
} from "@/services/skinCache";
import { useTranslation } from "@/i18n";
import type { Account } from "@/types/account";

type UVRect = [number, number, number, number];

interface CubeUV {
  top: UVRect;
  bottom: UVRect;
  right: UVRect;
  front: UVRect;
  left: UVRect;
  back: UVRect;
}

interface Point3 {
  x: number;
  y: number;
  z: number;
}

interface Part {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  uv: CubeUV;
}

interface Face {
  corners: [Point3, Point3, Point3, Point3];
  uv: UVRect;
  normal: Point3;
  shade: number;
}

interface SkinModel3DProps {
  account: Account | null;
  size?: number;
  className?: string;
}

/*
 * 皮肤按 Minecraft 64×64 标准布局解析。
 * 每个部件由内层与外层（帽子、外套、袖套、裤腿）两组 UV 组成。
 */
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

/*
 * 外层贴图比内层大 0.5 个单位，对应游戏里帽子和衣物的外扩量。
 */
const SHELL = 0.5;

/**
 * 按 Steve / Alex 两种模型组装部件。
 * 手臂与身体边缘贴合，不再额外留缝，避免出现“浮空手臂”。
 */
function buildParts(isSlim: boolean): Part[] {
  const armW = isSlim ? 3 : 4;

  return [
    { x0: -4, x1: 4, y0: 0, y1: 8, z0: -4, z1: 4, uv: HEAD },
    {
      x0: -4 - SHELL, x1: 4 + SHELL,
      y0: -SHELL, y1: 8 + SHELL,
      z0: -4 - SHELL, z1: 4 + SHELL,
      uv: HEAD_HAT,
    },
    { x0: -4, x1: 4, y0: 8, y1: 20, z0: -2, z1: 2, uv: BODY },
    {
      x0: -4 - SHELL, x1: 4 + SHELL,
      y0: 8 - SHELL, y1: 20 + SHELL,
      z0: -2 - SHELL, z1: 2 + SHELL,
      uv: BODY_OVERLAY,
    },
    { x0: -4 - armW, x1: -4, y0: 8, y1: 20, z0: -2, z1: 2, uv: isSlim ? RARM_SLIM : RARM },
    {
      x0: -4 - armW - SHELL, x1: -4 + SHELL,
      y0: 8 - SHELL, y1: 20 + SHELL,
      z0: -2 - SHELL, z1: 2 + SHELL,
      uv: isSlim ? RARM_SLIM_OVERLAY : RARM_OVERLAY,
    },
    { x0: 4, x1: 4 + armW, y0: 8, y1: 20, z0: -2, z1: 2, uv: isSlim ? LARM_SLIM : LARM },
    {
      x0: 4 - SHELL, x1: 4 + armW + SHELL,
      y0: 8 - SHELL, y1: 20 + SHELL,
      z0: -2 - SHELL, z1: 2 + SHELL,
      uv: isSlim ? LARM_SLIM_OVERLAY : LARM_OVERLAY,
    },
    { x0: -4, x1: 0, y0: 20, y1: 32, z0: -2, z1: 2, uv: RLEG },
    {
      x0: -4 - SHELL, x1: 0 + SHELL,
      y0: 20 - SHELL, y1: 32 + SHELL,
      z0: -2 - SHELL, z1: 2 + SHELL,
      uv: RLEG_OVERLAY,
    },
    { x0: 0, x1: 4, y0: 20, y1: 32, z0: -2, z1: 2, uv: LLEG },
    {
      x0: 0 - SHELL, x1: 4 + SHELL,
      y0: 20 - SHELL, y1: 32 + SHELL,
      z0: -2 - SHELL, z1: 2 + SHELL,
      uv: LLEG_OVERLAY,
    },
  ];
}

/**
 * 为每个立方体生成六个面。
 * UV 的左上角对应面片的 p0，右下角对应 p2，因此背面与侧面需要按观察方向
 * 调整角点顺序，贴图才不会左右镜像。
 */
function buildFaces(part: Part): Face[] {
  const { x0, x1, y0, y1, z0, z1, uv } = part;

  return [
    {
      corners: [
        { x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 },
        { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 },
      ],
      uv: uv.front,
      normal: { x: 0, y: 0, z: 1 },
      shade: 0,
    },
    {
      corners: [
        { x: x1, y: y0, z: z0 }, { x: x0, y: y0, z: z0 },
        { x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 },
      ],
      uv: uv.back,
      normal: { x: 0, y: 0, z: -1 },
      shade: 0.14,
    },
    {
      corners: [
        { x: x1, y: y0, z: z1 }, { x: x1, y: y0, z: z0 },
        { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 },
      ],
      uv: uv.right,
      normal: { x: 1, y: 0, z: 0 },
      shade: 0.1,
    },
    {
      corners: [
        { x: x0, y: y0, z: z0 }, { x: x0, y: y0, z: z1 },
        { x: x0, y: y1, z: z1 }, { x: x0, y: y1, z: z0 },
      ],
      uv: uv.left,
      normal: { x: -1, y: 0, z: 0 },
      shade: 0.16,
    },
    {
      corners: [
        { x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 },
        { x: x1, y: y0, z: z1 }, { x: x0, y: y0, z: z1 },
      ],
      uv: uv.top,
      normal: { x: 0, y: -1, z: 0 },
      shade: 0.05,
    },
    {
      corners: [
        { x: x0, y: y1, z: z1 }, { x: x1, y: y1, z: z1 },
        { x: x1, y: y1, z: z0 }, { x: x0, y: y1, z: z0 },
      ],
      uv: uv.bottom,
      normal: { x: 0, y: 1, z: 0 },
      shade: 0.26,
    },
  ];
}

/**
 * 平行投影：先绕竖直轴偏航，再绕水平轴俯仰，最后丢弃深度得到屏幕坐标。
 * 这种投影下每个面都是平行四边形，可以用 Canvas 仿射变换直接贴图。
 */
function rotatePoint(point: Point3, yaw: number, pitch: number): Point3 {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);

  const x = point.x * cosYaw + point.z * sinYaw;
  const z = -point.x * sinYaw + point.z * cosYaw;
  const y = point.y * cosPitch - z * sinPitch;

  return { x, y, z: point.y * sinPitch + z * cosPitch };
}

/**
 * 将 64×32 的旧皮肤也规范化为 64×64，缺失的下半部分保持透明。
 */
function normalizeSkinTexture(img: HTMLImageElement): HTMLCanvasElement {
  const legacy = img.naturalHeight < img.naturalWidth;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, 64, legacy ? 32 : 64);
  return canvas;
}

export function SkinModel3D({ account, size = 96, className = "" }: SkinModel3DProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [skin, setSkin] = useState<HTMLCanvasElement | null>(null);
  const [isSlim, setIsSlim] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [camera, setCamera] = useState({ yaw: -0.35, pitch: 0.12, zoom: 1 });
  const draggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!account) {
      setStatus("error");
      return;
    }

    setStatus("loading");
    let cancelled = false;

    const apply = (img: HTMLImageElement, slim: boolean) => {
      if (cancelled) return;
      setSkin(normalizeSkinTexture(img));
      setIsSlim(slim);
      setStatus("ready");
    };

    const cached = getCachedSkin(account.id);
    if (cached?.skinDataUrl) {
      loadImage(cached.skinDataUrl)
        .then((img) => apply(img, cached.isSlim))
        .catch(() => setStatus("error"));
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const img = await loadSkinForAccount(account);
        if (cancelled) return;
        const slim = detectSlimFromImage(img);
        cacheSkin(account.id, img);
        apply(img, slim);
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    el.style.touchAction = "none";

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      draggingRef.current = true;
      lastPosRef.current = { x: event.clientX, y: event.clientY };
      el.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = event.clientX - lastPosRef.current.x;
      const dy = event.clientY - lastPosRef.current.y;
      lastPosRef.current = { x: event.clientX, y: event.clientY };
      setCamera((current) => ({
        yaw: current.yaw + dx * 0.012,
        pitch: Math.max(-0.6, Math.min(0.6, current.pitch - dy * 0.008)),
        zoom: current.zoom,
      }));
    };

    const onPointerUp = () => {
      draggingRef.current = false;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setCamera((current) => ({
        ...current,
        zoom: Math.max(0.75, Math.min(1.5, current.zoom + (event.deltaY > 0 ? -0.06 : 0.06))),
      }));
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !skin) return;

    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    const parts = buildParts(isSlim);
    const faces = parts.flatMap((part) => buildFaces(part));

    /*
     * 模型坐标系以脚底为原点向下，整体高度 32 单位。
     * 旋转前先把竖直中心移到原点，避免俯仰时模型整体漂出画布。
     */
    const centerY = 16;
    const visible: Array<{ face: Face; points: Point3[]; depth: number }> = [];

    for (const face of faces) {
      const normal = rotatePoint(face.normal, camera.yaw, camera.pitch);
      if (normal.z <= 0.001) continue;

      const points = face.corners.map((corner) =>
        rotatePoint({ x: corner.x, y: corner.y - centerY, z: corner.z }, camera.yaw, camera.pitch),
      );
      const depth = points.reduce((sum, point) => sum + point.z, 0) / points.length;
      visible.push({ face, points, depth });
    }

    if (visible.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const item of visible) {
      for (const point of item.points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
    }

    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const scale = Math.min(
      (size * 0.84) / spanX,
      (size * 0.84) / spanY,
    ) * camera.zoom;
    const offsetX = size / 2 - ((minX + maxX) / 2) * scale;
    const offsetY = size / 2 - ((minY + maxY) / 2) * scale;

    visible.sort((a, b) => a.depth - b.depth);

    for (const { face, points } of visible) {
      const [p0, p1, , p3] = points;
      const [, , uw, vh] = face.uv;

      const axisUx = (p1.x - p0.x) * scale / uw;
      const axisUy = (p1.y - p0.y) * scale / uw;
      const axisVx = (p3.x - p0.x) * scale / vh;
      const axisVy = (p3.y - p0.y) * scale / vh;

      ctx.setTransform(
        dpr * axisUx,
        dpr * axisUy,
        dpr * axisVx,
        dpr * axisVy,
        dpr * (offsetX + p0.x * scale),
        dpr * (offsetY + p0.y * scale),
      );
      ctx.drawImage(skin, face.uv[0], face.uv[1], uw, vh, 0, 0, uw, vh);

      if (face.shade > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${face.shade})`;
        ctx.fillRect(0, 0, uw, vh);
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [skin, isSlim, camera, size]);

  const cursorClass = draggingRef.current ? "cursor-grabbing" : "cursor-grab";

  return (
    <div
      ref={wrapperRef}
      style={{ width: size, height: size }}
      className={`relative rounded-btn overflow-hidden select-none touch-none ${cursorClass} ${className}`}
      title={isSlim ? t("account.skinModelAlex") : t("account.skinModelSteve")}
    >
      <div className="absolute inset-0 bg-primary/[0.06]" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/5 to-transparent" />

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-on-surface-subtle">
          <User size={Math.max(18, size * 0.26)} className="opacity-60" />
        </div>
      )}

      {skin && status === "ready" && (
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size }}
          className="absolute inset-0"
          aria-label={isSlim ? t("account.skinModelAlex") : t("account.skinModelSteve")}
        />
      )}
    </div>
  );
}
