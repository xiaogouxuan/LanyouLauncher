import { invoke } from "@tauri-apps/api/core";
import type { VersionInfo, DownloadProgress } from "@/types/version";
import type { LoaderType } from "@/types/version";
import type { DownloadSource } from "@/types/settings";
import { useTaskStore } from "@/stores/taskStore";
import { t } from "@/i18n";

export const versionService = {
  async getManifest(downloadSource: DownloadSource): Promise<VersionInfo[]> {
    return invoke<VersionInfo[]>("get_manifest", { downloadSource });
  },

  async getInstalledVersions(): Promise<VersionInfo[]> {
    return invoke<VersionInfo[]>("get_installed_versions");
  },

  async downloadVersion(versionId: string, downloadSource: DownloadSource): Promise<void> {
    const taskId = `version_download:${versionId}`;
    useTaskStore.getState().addTask({
      id: taskId,
      type: "version_download",
      title: t("task.versionDownload", { version: versionId }),
      status: "pending",
      progress: 0,
      message: t("version.downloadingMetadata"),
    });

    try {
      await invoke("download_version", { versionId, downloadSource });
    } catch (error) {
      useTaskStore.getState().updateTask(taskId, {
        status: "error",
        message: String(error),
        error: String(error),
      });
      throw error;
    }
  },

  async installLoader(versionId: string, loader: string): Promise<void> {
    return invoke("install_loader", { versionId, loader });
  },

  async deleteVersion(versionId: string): Promise<void> {
    return invoke("delete_version", { versionId });
  },

  async toggleVersionIsolation(versionId: string): Promise<void> {
    return invoke("toggle_version_isolation", { versionId });
  },

  async selectVersionGameDir(versionId: string): Promise<string | null> {
    return invoke<string | null>("select_version_game_dir", { versionId });
  },

  async clearVersionGameDir(versionId: string): Promise<void> {
    return invoke("clear_version_game_dir", { versionId });
  },
};
