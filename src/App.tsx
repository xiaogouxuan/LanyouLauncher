import { RouterProvider } from "react-router-dom";
import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { router } from "@/router";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { SplashScreen, AppReveal } from "@/components/common/SplashScreen";
import { ToastProvider } from "@/components/ui/Toast";
import { UpdateDialog } from "@/components/update/UpdateDialog";
import { updateService, type UpdateRelease } from "@/services/updateService";
import { useUIStore } from "@/stores/uiStore";
import { useAccountStore } from "@/stores/accountStore";
import { useVersionStore } from "@/stores/versionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { accountService } from "@/services/accountService";
import { versionService } from "@/services/versionService";
import { settingsService } from "@/services/settingsService";
import { taskService } from "@/services/taskService";
import { BRAND_THEME_COLOR, builtinWallpaperThemeColor, builtinWallpaperTone, type TextTone } from "@/lib/wallpaperTheme";

function DataInitializer({ children }: { children: React.ReactNode }) {
  const { setAccounts, setActiveAccount } = useAccountStore();
  const { setInstalledVersions } = useVersionStore();
  const { setSettings } = useSettingsStore();
  const { setLanguage, setTheme } = useUIStore();

  useEffect(() => {
    // 加载账号
    accountService
      .getAccounts()
      .then((accounts) => {
        setAccounts(accounts);
        setActiveAccount(accounts.find((a) => a.is_active) ?? null);
      })
      .catch(() => {});

    // 加载已安装版本
    versionService
      .getInstalledVersions()
      .then((versions) => setInstalledVersions(versions))
      .catch(() => {});

    // 加载设置
    settingsService
      .getSettings()
      .then((settings) => {
        setSettings(settings);
        setLanguage(settings.language);
        setTheme(settings.theme);
      })
      .catch(() => {
        // 读取失败也要标记为已加载，否则后续在设置页修改的内容永远不会写盘
        setSettings(useSettingsStore.getState().settings);
      });

    // 启动全局任务监听器
    taskService.startListening().catch(() => {});
  }, [
    setAccounts,
    setActiveAccount,
    setInstalledVersions,
    setSettings,
    setLanguage,
    setTheme,
  ]);

  return <>{children}</>;
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme);
  const settings = useSettingsStore((s) => s.settings);

  useEffect(() => {
    const root = document.documentElement;

    if (theme === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      root.classList.toggle("dark", prefersDark);

      const handler = (e: MediaQueryListEvent) => {
        root.classList.toggle("dark", e.matches);
      };
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else {
      root.classList.toggle("dark", theme === "dark");
    }
  }, [theme]);

  // 应用背景图 CSS 变量
  useEffect(() => {
    const root = document.documentElement;
    let imageUrl = "none";
    let solidColor = "transparent";
    let imageSrc: string | null = null;

    if (settings.background_image) {
      // 自定义图片背景优先于内置壁纸和纯色
      try {
        imageSrc = convertFileSrc(settings.background_image);
        imageUrl = `url("${imageSrc}")`;
      } catch {
        imageUrl = "none";
      }
    } else if (settings.wallpaper.startsWith("solid:")) {
      solidColor = settings.wallpaper.slice(6) || "transparent";
    } else if (settings.wallpaper) {
      imageSrc = `/img/${settings.wallpaper}.jpg`;
      imageUrl = `url(${imageSrc})`;
    }

    root.style.setProperty("--background-image", imageUrl);
    root.style.setProperty("--background-solid", solidColor);
    root.style.setProperty("--background-opacity", String(settings.background_opacity));
    root.style.setProperty("--background-blur", `${settings.background_blur}px`);

    // 依据壁纸实际画面自动决定压在壁纸上的文字颜色。
    // 顶部标题、中部问候语、底部导航分别按自身元素的位置取样，
    // 这样换页面、改窗口大小后取到的都是文字真正压在的像素。
    const textVariables = [
      "--wallpaper-text-color",
      "--wallpaper-text-color-mid",
      "--wallpaper-text-color-bottom",
      "--wallpaper-contrast-color",
      "--wallpaper-text-shadow",
      "--wallpaper-text-shadow-mid",
      "--wallpaper-text-shadow-bottom",
      "--wallpaper-text-color-low",
      "--wallpaper-text-shadow-low",
    ];
    textVariables.forEach((variable) => root.style.removeProperty(variable));

    // 内置壁纸先用预置色调打底：样本还没算出来、或者像素取样被浏览器拦掉时，
    // 文字也不会退回默认的深灰色（那正是「白底上写字、深底上也写字」的根源）
    const preset = builtinWallpaperTone(settings.wallpaper);
    if (preset && imageSrc) applyTonePreset(preset);

    if (!imageSrc) {
      if (solidColor !== "transparent") {
        const rgb = hexToRgb(solidColor);
        if (rgb) {
          const luminance =
            (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
          const light = luminance > 0.55;
          const color = light ? "#1B1B1F" : "#FFFFFF";
          root.style.setProperty("--wallpaper-text-color", color);
          root.style.setProperty("--wallpaper-text-color-mid", color);
          root.style.setProperty("--wallpaper-text-color-bottom", color);
          root.style.setProperty(
            "--wallpaper-contrast-color",
            light ? "#FFFFFF" : "#1B1B1F"
          );
        }
      }
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | null = null;

    createWallpaperProbe(imageSrc).then((probe) => {
      if (disposed || !probe) return;

      const apply = () => {
        if (disposed) return;

        // 顶部页面标题：只取标题文字本身覆盖的那几条像素
        paintTextColor(probe, measureTextRects([".wallpaper-text"]), {
          colorVariable: "--wallpaper-text-color",
          shadowVariable: "--wallpaper-text-shadow",
          darkMedianLightness: 72,
          darkMinLightness: 58,
        }, relativeRegion(0.05, 0.35, 0.09, 0.2));

        // 中部问候语
        paintTextColor(probe, measureTextRects([".wallpaper-text-mid"]), {
          colorVariable: "--wallpaper-text-color-mid",
          shadowVariable: "--wallpaper-text-shadow-mid",
          darkMedianLightness: 72,
          darkMinLightness: 58,
        }, relativeRegion(0.08, 0.56, 0.6, 0.78));

        // 中下部的小标题、提示语（比问候语更低，背景往往已经是深色植被）
        paintTextColor(probe, measureTextRects([".wallpaper-text-low"]), {
          colorVariable: "--wallpaper-text-color-low",
          shadowVariable: "--wallpaper-text-shadow-low",
          darkMedianLightness: 72,
          darkMinLightness: 58,
        }, relativeRegion(0.05, 0.55, 0.66, 0.8));

        // 底部导航：只取未选中标签的文字，避免把选中胶囊自己的深色也算进背景
        paintTextColor(probe, measureTextRects(["nav .nav-tab"]), {
          colorVariable: "--wallpaper-text-color-bottom",
          contrastVariable: "--wallpaper-contrast-color",
          shadowVariable: "--wallpaper-text-shadow-bottom",
          // 导航栏压在草地、树叶这类高频画面上，只有接近纯白的背景才用深色文字
          darkMedianLightness: 88,
          darkMinLightness: 80,
          forceShadow: true,
        }, relativeRegion(0.02, 0.5, 0.9, 0.98));
      };

      apply();

      // 换页后标题位置会变，重新取样一次；窗口尺寸变化同理
      const onResize = () => apply();
      window.addEventListener("resize", onResize);
      const unsubscribeRoute = router.subscribe(() => {
        // 页面组件是懒加载的，等首屏渲染完再取一次标题位置，
        // 稍后再补一次，避免骨架屏阶段取到空区域
        window.setTimeout(apply, 180);
        window.setTimeout(apply, 620);
      });

      cleanup = () => {
        window.removeEventListener("resize", onResize);
        unsubscribeRoute();
      };
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [settings.wallpaper, settings.background_image, settings.background_opacity, settings.background_blur]);

  // 应用主题主色：跟随内置壁纸时用壁纸配套色，手动选色后以调色盘为准
  useEffect(() => {
    const root = document.documentElement;
    const wallpaperColor = settings.background_image
      ? null
      : builtinWallpaperThemeColor(settings.wallpaper);
    const hex =
      settings.theme_color_auto && wallpaperColor
        ? wallpaperColor
        : settings.theme_color || BRAND_THEME_COLOR;
    const rgb = hexToRgb(hex);

    root.style.setProperty("--accent-color", hex);
    root.style.setProperty("--theme-color", hex);
    if (rgb) {
      root.style.setProperty("--accent-rgb", `${rgb.r} ${rgb.g} ${rgb.b}`);
      root.style.setProperty("--theme-color-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);

      // 导航选中胶囊用主题色填充，胶囊里的文字按主题色亮度自动取黑/白
      const accentLuminance =
        (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
      root.style.setProperty(
        "--nav-pill-text",
        accentLuminance > 0.6 ? "#15161A" : "#FFFFFF",
      );
    }
  }, [
    settings.theme_color,
    settings.theme_color_auto,
    settings.wallpaper,
    settings.background_image,
  ]);

  // 界面材质：solid（默认纯色）/ frosted（磨砂玻璃）/ liquid（液态玻璃）
  useEffect(() => {
    document.documentElement.dataset.material = settings.ui_material || "solid";
  }, [settings.ui_material]);

  return <>{children}</>;
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  if (clean.length !== 6 || Number.isNaN(bigint)) return null;
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

interface SampleRegion {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** 窗口坐标下的矩形 */
interface RectBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 壁纸取样画布：整张壁纸按比例缩到固定宽度，方便逐像素统计 */
interface WallpaperProbe {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface TextPaintOptions {
  colorVariable: string;
  contrastVariable?: string;
  shadowVariable?: string;
  /** 只有中部感知亮度达到该值才使用深色文字 */
  darkMedianLightness: number;
  /** 暗部亮度也要达到该值，否则宁可继续用白色（防止深色文字压进阴影里） */
  darkMinLightness: number;
  /** 无论对比如何都带一层描影（导航这类压在复杂纹理上的文字） */
  forceShadow?: boolean;
}

/** 把壁纸绘制到一张中等分辨率的画布上，供后续反复取样 */
async function createWallpaperProbe(src: string): Promise<WallpaperProbe | null> {
  const draw = (source: CanvasImageSource, naturalWidth: number, naturalHeight: number) => {
    const width = 384;
    const height = Math.max(1, Math.round((naturalHeight / naturalWidth) * width));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    return { data, width, height };
  };

  const image = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

  if (image) {
    try {
      return draw(image, image.naturalWidth, image.naturalHeight);
    } catch {
      // 跨源图片会污染画布，继续走 blob 兜底
    }
  }

  try {
    const response = await fetch(src);
    const bitmap = await createImageBitmap(await response.blob());
    const probe = draw(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    return probe;
  } catch {
    return null;
  }
}

/** 文字色常量：避免各处硬编码不一致 */
const TEXT_LIGHT = "#FFFFFF";
const TEXT_DARK = "#15161A";

/** 用壁纸预置色调写入三个区域的文字颜色 */
function applyTonePreset(tone: { top: TextTone; mid: TextTone; bottom: TextTone }) {
  const root = document.documentElement;
  root.style.setProperty("--wallpaper-text-color", tone.top === "light" ? TEXT_LIGHT : TEXT_DARK);
  root.style.setProperty("--wallpaper-text-color-mid", tone.mid === "light" ? TEXT_LIGHT : TEXT_DARK);
  root.style.setProperty("--wallpaper-text-color-bottom", tone.bottom === "light" ? TEXT_LIGHT : TEXT_DARK);
  root.style.setProperty("--wallpaper-contrast-color", tone.bottom === "light" ? TEXT_DARK : TEXT_LIGHT);
  root.style.setProperty("--wallpaper-text-shadow", "none");
  root.style.setProperty("--wallpaper-text-shadow-mid", "none");
  root.style.setProperty("--wallpaper-text-color-low", tone.mid === "light" ? TEXT_LIGHT : TEXT_DARK);
  root.style.setProperty("--wallpaper-text-shadow-low", "none");
  // 白字压在草地、树叶上时先给一层最轻的描影，等取样结果出来再决定是否加强
  root.style.setProperty(
    "--wallpaper-text-shadow-bottom",
    tone.bottom === "light" ? "0 1px 3px rgb(0 0 0 / 0.35)" : "none",
  );
}

/**
 * 取文字自身的字形矩形（不是整个元素盒子）。
 * 用 Range 的 client rects 能拿到每一行文字真正覆盖的范围，
 * 短标题、居中问候语都不会把大片空白算进背景。
 */
function measureTextRects(selectors: string[]): RectBox[] {
  const boxes: RectBox[] = [];
  for (const selector of selectors) {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) < 0.05
      ) {
        continue;
      }

      const range = document.createRange();
      range.selectNodeContents(element);
      let rects: DOMRect[] = Array.from(range.getClientRects());
      if (rects.length === 0) {
        const rect = element.getBoundingClientRect();
        if (rect.width >= 4 && rect.height >= 4) rects = [rect];
      }
      range.detach?.();

      for (const rect of rects) {
        if (rect.width < 3 || rect.height < 3) continue;
        // 少量外扩，覆盖文字边缘的抗锯齿像素
        const pad = 3;
        boxes.push({
          x: rect.left - pad,
          y: rect.top - pad,
          w: rect.width + pad * 2,
          h: rect.height + pad * 2,
        });
      }
    }
  }
  return boxes;
}

function relativeRegion(x0: number, x1: number, y0: number, y1: number): RectBox {
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  return { x: x0 * vw, y: y0 * vh, w: (x1 - x0) * vw, h: (y1 - y0) * vh };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * 把窗口坐标换算成壁纸上的相对区域。
 * 背景是 cover + center，需要先按「铺满窗口」的缩放和偏移反推。
 */
function windowRectToImageRegion(
  rect: RectBox,
  probe: WallpaperProbe,
): SampleRegion | null {
  const vw = window.innerWidth || probe.width;
  const vh = window.innerHeight || probe.height;
  const scale = Math.max(vw / probe.width, vh / probe.height);
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const offsetX = (vw - probe.width * scale) / 2;
  const offsetY = (vh - probe.height * scale) / 2;

  return {
    x0: clamp01((rect.x - offsetX) / scale / probe.width),
    x1: clamp01((rect.x + rect.w - offsetX) / scale / probe.width),
    y0: clamp01((rect.y - offsetY) / scale / probe.height),
    y1: clamp01((rect.y + rect.h - offsetY) / scale / probe.height),
  };
}

/** 相对亮度 Y (0~1) → CIE 感知亮度 L* (0~100) */
function luminanceToLightness(luminance: number): number {
  const y = Math.min(1, Math.max(0, luminance));
  const value = y <= 0.008856 ? 7.787 * y : Math.cbrt(y);
  return Math.min(100, Math.max(0, 116 * value - 16));
}

interface LightnessStats {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

function percentile(sorted: number[], ratio: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(ratio * (sorted.length - 1))),
  );
  return sorted[index];
}

/** 取样并写入对应的 CSS 变量 */
function paintTextColor(
  probe: WallpaperProbe,
  rects: RectBox[],
  options: TextPaintOptions,
  fallbackRect?: RectBox,
) {
  const samples = rects.length > 0 ? rects : fallbackRect ? [fallbackRect] : [];
  if (samples.length === 0) return;

  // 逐块取样：只收集文字覆盖到的像素，不把整行空白平均进来
  const lightness: number[] = [];
  for (const rect of samples) {
    const region = windowRectToImageRegion(rect, probe);
    if (!region) continue;

    for (let y = 0; y < probe.height; y++) {
      const cy = (y + 0.5) / probe.height;
      if (cy < region.y0 || cy > region.y1) continue;
      for (let x = 0; x < probe.width; x++) {
        const cx = (x + 0.5) / probe.width;
        if (cx < region.x0 || cx > region.x1) continue;
        const i = (y * probe.width + x) * 4;
        const luminance =
          (0.2126 * probe.data[i] +
            0.7152 * probe.data[i + 1] +
            0.0722 * probe.data[i + 2]) /
          255;
        lightness.push(luminanceToLightness(luminance));
      }
    }
  }

  if (lightness.length < 16) return;
  lightness.sort((a, b) => a - b);

  const stats: LightnessStats = {
    p10: percentile(lightness, 0.1),
    p25: percentile(lightness, 0.25),
    p50: percentile(lightness, 0.5),
    p75: percentile(lightness, 0.75),
    p90: percentile(lightness, 0.9),
  };

  // 只有背景整体足够亮、且暗部也不暗时才用深色文字；
  // 其余情况一律白字——壁纸场景里「深色文字压进阴影」比「白字略糊」更难接受。
  const useLightText =
    stats.p50 < options.darkMedianLightness ||
    stats.p25 < options.darkMinLightness;

  const root = document.documentElement;
  root.style.setProperty(options.colorVariable, useLightText ? "#FFFFFF" : "#15161A");

  if (options.contrastVariable) {
    root.style.setProperty(
      options.contrastVariable,
      useLightText ? "#15161A" : "#FFFFFF",
    );
  }

  if (options.shadowVariable) {
    const contrastDelta = useLightText ? 100 - stats.p50 : stats.p50 - 5;
    const spread = stats.p90 - stats.p10;
    const needShadow =
      options.forceShadow || contrastDelta < 42 || spread > 34;

    root.style.setProperty(
      options.shadowVariable,
      needShadow
        ? useLightText
          ? "0 1px 3px rgb(0 0 0 / 0.5), 0 0 10px rgb(0 0 0 / 0.22)"
          : "0 1px 3px rgb(255 255 255 / 0.7), 0 0 10px rgb(255 255 255 / 0.35)"
        : "none",
    );
  }
}

/**
 * 启动后自动检查更新：开启「自动检查更新」时，延迟数秒请求 Gitee 主仓库，
 * 有更新则弹出带更新日志的提示弹窗，失败时保持静默。
 */
function UpdateChecker() {
  const [release, setRelease] = useState<UpdateRelease | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        if (!useSettingsStore.getState().settings.auto_update) return;
        const result = await updateService.checkUpdate();
        if (!cancelled && result) setRelease(result);
      } catch {
        // 启动阶段网络不可用时不打扰用户
      }
    }, 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <UpdateDialog
      open={Boolean(release)}
      release={release}
      onClose={() => setRelease(null)}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SplashScreen />
      <DataInitializer>
        <ThemeProvider>
          <ToastProvider>
            <AppReveal>
              <RouterProvider router={router} />
            </AppReveal>
            <UpdateChecker />
          </ToastProvider>
        </ThemeProvider>
      </DataInitializer>
    </ErrorBoundary>
  );
}