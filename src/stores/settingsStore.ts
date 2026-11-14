import { create } from "zustand";
import type { Settings } from "@/types/settings";

interface SettingsState {
  settings: Settings;
  loading: boolean;
  /** 是否已从磁盘加载过一次，未加载前不得把默认值写回磁盘 */
  hydrated: boolean;
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
  wallpaper: "img4",
  background_image: "",
  background_opacity: 1,
  background_blur: 0,
  theme_color: "#2F6BFF",
  theme_color_auto: true,
  ui_material: "solid",
  close_after_launch: false,
};

export const useSettingsStore = create<SettingsState>()((set) => ({
  settings: defaultSettings,
  loading: false,
  hydrated: false,
  setSettings: (settings) => set({ settings, hydrated: true }),
  setLoading: (loading) => set({ loading }),
  updateSetting: (key, value) =>
    set((s) => ({
      settings: { ...s.settings, [key]: value },
    })),
}));