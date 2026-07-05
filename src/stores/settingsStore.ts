import { create } from "zustand";
import type { Settings } from "@/types/settings";

interface SettingsState {
  settings: Settings;
  loading: boolean;
  setSettings: (settings: Settings) => void;
  setLoading: (loading: boolean) => void;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const defaultSettings: Settings = {
  language: "zh-CN",
  theme: "system",
  download_source: "official",
  java_paths: [],
  default_memory: 4096,
  default_game_dir: "",
  auto_update: true,
  wallpaper: "img1",
  background_image: "",
  background_opacity: 0.15,
  background_blur: 0,
  theme_color: "#3B82F6",
  close_after_launch: false,
};

export const useSettingsStore = create<SettingsState>()((set) => ({
  settings: defaultSettings,
  loading: false,
  setSettings: (settings) => set({ settings }),
  setLoading: (loading) => set({ loading }),
  updateSetting: (key, value) =>
    set((s) => ({
      settings: { ...s.settings, [key]: value },
    })),
}));