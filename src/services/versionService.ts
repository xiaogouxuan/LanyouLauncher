import { invoke } from "@tauri-apps/api/core";
import type { VersionInfo, DownloadProgress, ExportOption, LoaderVersionInfo } from "@/types/version";
import type { LoaderType } from "@/types/version";
import type { DownloadSource } from "@/types/settings";
import { useTaskStore } from "@/stores/taskStore";
import { ignoreTaskEvents, resumeTaskEvents } from "@/services/taskService";
import { t } from "@/i18n";

export const versionService = {
  async getManifest(downloadSource: DownloadSource): Promise<VersionInfo[]> {
    return invoke<VersionInfo[]>("get_manifest", { downloadSource });
  },

  async getInstalledVersions(): Promise<VersionInfo[]> {
    return invoke<VersionInfo[]>("get_installed_versions");
  },

  async downloadVersion(versionId: string, downloadSource: DownloadSource): Promise<boolean> {
    const taskId = `version_download:${versionId}`;
    resumeTaskEvents(taskId);
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
      return true;
    } catch (error) {
      if (String(error).includes("downloadCancelled")) {
        // 用户主动取消：静默清理，不当作错误提示
        useTaskStore.getState().removeTask(taskId);
        return false;
      }
      useTaskStore.getState().updateTask(taskId, {
        status: "error",
        message: String(error),
        error: String(error),
      });
      throw error;
    }
  },

  /** 取消正在进行的版本下载，立即从任务列表移除并停止后端传输 */
  async cancelDownload(versionId: string): Promise<void> {
    const taskId = `version_download:${versionId}`;
    ignoreTaskEvents(taskId);
    useTaskStore.getState().removeTask(taskId);
    try {
      await invoke("cancel_version_download", { versionId });
    } catch {
      // 后端已结束时无需处理
    }
  },

  async getLoaderVersions(versionId: string, loader: LoaderType): Promise<LoaderVersionInfo[]> {
    return invoke<LoaderVersionInfo[]>("get_loader_versions", { versionId, loader });
  },

  async installLoader(versionId: string, loader: LoaderType, loaderVersion?: string): Promise<void> {
    return invoke("install_loader", { versionId, loader, loaderVersion });
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

  async selectVersionJava(versionId: string): Promise<string | null> {
    return invoke<string | null>("select_version_java", { versionId });
  },

  async clearVersionJava(versionId: string): Promise<void> {
    return invoke("clear_version_java", { versionId });
  },

  async exportVersionPack(versionId: string, options: ExportOption[]): Promise<string | null> {
    return invoke<string | null>("export_version_pack", { versionId, options });
  },

  async openVersionDir(versionId: string): Promise<void> {
    return invoke("open_version_dir", { versionId });
  },
};
