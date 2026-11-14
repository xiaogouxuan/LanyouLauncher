import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "@/types/settings";

export interface SystemInfo {
  os: string;
  arch: string;
  family: string;
  total_memory_mb: number;
  recommended_memory_mb: number;
}

/** 设置写入队列，保证多次保存按发起顺序落盘 */
let saveQueue: Promise<unknown> = Promise.resolve();

export const settingsService = {
  async getSettings(): Promise<Settings> {
    return invoke<Settings>("get_settings");
  },

  async saveSettings(settings: Settings): Promise<void> {
    return invoke("save_settings", { settings });
  },

  /**
   * 串行保存设置。
   * 连续改设置时如果并发写入，后发起的请求可能先落盘，
   * 导致旧值覆盖新值（例如换壁纸后又变回默认壁纸），这里用队列保证顺序。
   */
  queueSave(settings: Settings): Promise<void> {
    saveQueue = saveQueue
      .then(() => invoke("save_settings", { settings }))
      .catch(() => {});
    return saveQueue.then(() => undefined);
  },

  async detectJava(): Promise<[string, string][]> {
    return invoke<[string, string][]>("detect_java");
  },

  async selectJavaForVersion(versionId: string): Promise<[string, string]> {
    return invoke<[string, string]>("select_java_for_version", { versionId });
  },

  async getJavaVersion(javaPath: string): Promise<string> {
    return invoke<string>("get_java_version", { javaPath });
  },

  async getSystemInfo(): Promise<SystemInfo> {
    return invoke<string>("get_system_info").then((json) => JSON.parse(json));
  },

  async selectBackgroundImage(): Promise<string | null> {
    return invoke<string | null>("select_background_image");
  },

  async downloadJava(major: number): Promise<string> {
    return invoke<string>("download_java", { major });
  },

  /** 在系统文件管理器中打开本地文件或目录 */
  async openPath(path: string): Promise<void> {
    return invoke("open_path", { path });
  },

  /** 在文件管理器中打开游戏目录 */
  async openGameDir(gameDir?: string): Promise<void> {
    return invoke("open_game_dir", { gameDir });
  },
};