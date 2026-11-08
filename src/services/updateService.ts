import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { APP_VERSION } from "@/utils/constants";

export interface UpdateRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  download_url: string | null;
  published_at: string | null;
  source: "gitee" | "github";
}

export interface UpdateProgress {
  downloaded: number;
  total: number;
}

export const updateService = {
  async checkUpdate(): Promise<UpdateRelease | null> {
    return invoke<UpdateRelease | null>("check_update", {
      currentVersion: APP_VERSION,
    });
  },

  /** 下载更新包并自动替换、重启 */
  async installUpdate(downloadUrl: string): Promise<void> {
    return invoke("install_update", { downloadUrl });
  },

  /** 监听更新包下载进度 */
  onProgress(handler: (progress: UpdateProgress) => void): Promise<UnlistenFn> {
    return listen<UpdateProgress>("update-progress", (event) => handler(event.payload));
  },
};
