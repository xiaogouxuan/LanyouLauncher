import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "@/types/settings";

export interface SystemInfo {
  os: string;
  arch: string;
  family: string;
  total_memory_mb: number;
  recommended_memory_mb: number;
}

export const settingsService = {
  async getSettings(): Promise<Settings> {
    return invoke<Settings>("get_settings");
  },

  async saveSettings(settings: Settings): Promise<void> {
    return invoke("save_settings", { settings });
  },

  async detectJava(): Promise<[string, string][]> {
    return invoke<[string, string][]>("detect_java");
  },

  async selectJavaForVersion(versionId: string): Promise<[string, string]> {
    return invoke<[string, string]>("select_java_for_version", { versionId });
  },

  async getSystemInfo(): Promise<SystemInfo> {
    return invoke<string>("get_system_info").then((json) => JSON.parse(json));
  },

  async selectBackgroundImage(): Promise<string | null> {
    return invoke<string | null>("select_background_image");
  },
};