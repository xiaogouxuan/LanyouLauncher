import { RouterProvider } from "react-router-dom";
import { useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { router } from "@/router";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import { useUIStore } from "@/stores/uiStore";
import { useAccountStore } from "@/stores/accountStore";
import { useVersionStore } from "@/stores/versionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { accountService } from "@/services/accountService";
import { versionService } from "@/services/versionService";
import { settingsService } from "@/services/settingsService";
import { taskService } from "@/services/taskService";
import { applyMd3PaletteToRoot } from "@/utils/md3Palette";

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
    if (settings.background_image) {
      // 自定义背景优先于内置壁纸
      try {
        imageUrl = `url(${convertFileSrc(settings.background_image)})`;
      } catch {
        imageUrl = "none";
      }
    } else if (settings.wallpaper) {
      imageUrl = `url(/img/${settings.wallpaper}.png)`;
    }
    root.style.setProperty("--background-image", imageUrl);
    root.style.setProperty("--background-opacity", String(settings.background_opacity));
    root.style.setProperty("--background-blur", `${settings.background_blur}px`);
  }, [settings.wallpaper, settings.background_image, settings.background_opacity, settings.background_blur]);

  // 应用 MD3 Expressive 调色板
  useEffect(() => {
    const root = document.documentElement;
    const hex = settings.theme_color || "#3B82F6";
    const isDark = root.classList.contains("dark");

    root.style.setProperty("--theme-color", hex);
    const rgb = hexToRgb(hex);
    if (rgb) {
      root.style.setProperty("--theme-color-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    }

    applyMd3PaletteToRoot(hex, isDark);
  }, [settings.theme_color, theme]);

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

export default function App() {
  return (
    <ErrorBoundary>
      <DataInitializer>
        <ThemeProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </ThemeProvider>
      </DataInitializer>
    </ErrorBoundary>
  );
}