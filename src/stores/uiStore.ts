import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemeMode } from "@/types/settings";

interface UIState {
  sidebarCollapsed: boolean;
  theme: ThemeMode;
  language: string;
  consoleVisible: boolean;
  toggleSidebar: () => void;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (lang: string) => void;
  toggleConsole: () => void;
}

const getSystemLanguage = (): string => {
  const navLang = navigator.language.toLowerCase();
  if (navLang.startsWith("zh")) return "zh-CN";
  return "en-US";
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme: "system",
      language: getSystemLanguage(),
      consoleVisible: false,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      toggleConsole: () =>
        set((s) => ({ consoleVisible: !s.consoleVisible })),
    }),
    {
      name: "lanyou-ui-store",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        language: state.language,
      }),
    }
  )
);