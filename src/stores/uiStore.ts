import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemeMode } from "@/types/settings";

interface UIState {
  theme: ThemeMode;
  language: string;
  consoleVisible: boolean;
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
      theme: "system",
      language: getSystemLanguage(),
      consoleVisible: false,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      toggleConsole: () =>
        set((s) => ({ consoleVisible: !s.consoleVisible })),
    }),
    {
      name: "lanyou-ui-store",
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
      }),
    }
  )
);