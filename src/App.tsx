import { RouterProvider } from "react-router-dom";
import { useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { router } from "@/router";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { SplashScreen, AppReveal } from "@/components/common/SplashScreen";
import { ToastProvider } from "@/components/ui/Toast";
import { useUIStore } from "@/stores/uiStore";
import { useAccountStore } from "@/stores/accountStore";
import { useVersionStore } from "@/stores/versionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { accountService } from "@/services/accountService";
import { versionService } from "@/services/versionService";
import { settingsService } from "@/services/settingsService";
import { taskService } from "@/services/taskService";
import {
  builtinWallpaperThemeColor,
  isLegacyDefaultThemeColor,
} from "@/lib/wallpaperTheme";

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
        const active = accounts.find((a) => a.is_active);
        if (active) setActiveAccount(active);
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
      .catch(() => {});

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

    // 依据壁纸亮度自动决定压在壁纸上的文字颜色，无需手动设置或加描影
    // 顶部标题与中部问候语分别取各自区域的亮度，避免一处判断影响整页
    root.style.removeProperty("--wallpaper-text-color");
    root.style.removeProperty("--wallpaper-text-color-mid");
    if (imageSrc) {
      detectWallpaperLuminance(imageSrc, {
        x0: 0.07,
        x1: 0.32,
        y0: 0.11,
        y1: 0.2,
      }).then((luminance) => {
        if (luminance === null) return;
        root.style.setProperty(
          "--wallpaper-text-color",
          luminance > 0.45 ? "#1B1B1F" : "#FFFFFF"
        );
      });
      detectWallpaperLuminance(imageSrc, {
        x0: 0.11,
        x1: 0.5,
        y0: 0.42,
        y1: 0.53,
      }).then((luminance) => {
        if (luminance === null) return;
        root.style.setProperty(
          "--wallpaper-text-color-mid",
          luminance > 0.45 ? "#1B1B1F" : "#FFFFFF"
        );
      });
    } else if (solidColor !== "transparent") {
      const rgb = hexToRgb(solidColor);
      if (rgb) {
        const luminance =
          (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
        root.style.setProperty(
          "--wallpaper-text-color",
          luminance > 0.55 ? "#1B1B1F" : "#FFFFFF"
        );
      }
    }
  }, [settings.wallpaper, settings.background_image, settings.background_opacity, settings.background_blur]);

  // 应用主题主色：优先使用壁纸配套色，设计系统通过 RGB 通道变量派生所有强调色
  useEffect(() => {
    const root = document.documentElement;
    const wallpaperColor = settings.background_image
      ? null
      : builtinWallpaperThemeColor(settings.wallpaper);
    // 老用户从未手动改过主题色时，跟随内置壁纸的配套色，避免继续用默认蓝造成割裂感
    const hex =
      wallpaperColor && isLegacyDefaultThemeColor(settings.theme_color)
        ? wallpaperColor
        : settings.theme_color || wallpaperColor || "#2F6BFF";
    const rgb = hexToRgb(hex);

    root.style.setProperty("--accent-color", hex);
    root.style.setProperty("--theme-color", hex);
    if (rgb) {
      root.style.setProperty("--accent-rgb", `${rgb.r} ${rgb.g} ${rgb.b}`);
      root.style.setProperty("--theme-color-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    }
  }, [
    settings.theme_color,
    settings.wallpaper,
    settings.background_image,
  ]);

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

/**
 * 采样壁纸指定区域的平均亮度（区域按 0~1 的相对坐标给出）。
 * 返回 0~1，读取失败时返回 null。
 */
function detectWallpaperLuminance(
  src: string,
  region: SampleRegion,
): Promise<number | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = async () => {
      try {
        resolve(sampleLuminance(image, region));
      } catch {
        // 自定义图片是跨源资源，canvas 会被污染；改用 blob 重绘后再采样
        try {
          const response = await fetch(src);
          const bitmap = await createImageBitmap(await response.blob());
          resolve(sampleLuminance(bitmap, region));
        } catch {
          resolve(null);
        }
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/** 把图片绘制到 32×20 的缩略画布，并按区域统计平均亮度 */
function sampleLuminance(
  source: CanvasImageSource,
  region: SampleRegion,
): number | null {
  const width = 32;
  const height = 20;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  const sx = Math.max(0, Math.floor(region.x0 * width));
  const ex = Math.min(width, Math.ceil(region.x1 * width));
  const sy = Math.max(0, Math.floor(region.y0 * height));
  const ey = Math.min(height, Math.ceil(region.y1 * height));

  let total = 0;
  let count = 0;
  for (let y = sy; y < ey; y++) {
    for (let x = sx; x < ex; x++) {
      const i = (y * width + x) * 4;
      total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      count++;
    }
  }
  return count > 0 ? total / count / 255 : null;
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
          </ToastProvider>
        </ThemeProvider>
      </DataInitializer>
    </ErrorBoundary>
  );
}