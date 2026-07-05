import { invoke } from "@tauri-apps/api/core";
import type { ModInfo } from "@/types/mod";

export const modService = {
  async searchModrinth(
    query: string,
    version?: string,
    loader?: string,
  ): Promise<ModInfo[]> {
    return invoke<ModInfo[]>("search_modrinth", { query, version, loader });
  },

  async getRecommendations(): Promise<ModInfo[]> {
    return invoke<ModInfo[]>("search_modrinth", { query: "" });
  },

  async searchCurseForge(
    query: string,
    version?: string,
    loader?: string,
  ): Promise<ModInfo[]> {
    return invoke<ModInfo[]>("search_curseforge", { query, version, loader });
  },

  async downloadMod(
    modId: string,
    source: string,
    versionId?: string,
    targetVersion?: string,
  ): Promise<void> {
    return invoke("download_mod", { modId, source, versionId, targetVersion });
  },

  async getInstalledMods(targetVersion?: string): Promise<ModInfo[]> {
    return invoke<ModInfo[]>("get_installed_mods", { targetVersion });
  },

  async toggleMod(modId: string, enabled: boolean, targetVersion?: string): Promise<void> {
    return invoke("toggle_mod", { modId, enabled, targetVersion });
  },

  async deleteMod(modId: string, targetVersion?: string): Promise<void> {
    return invoke("delete_mod", { modId, targetVersion });
  },
};