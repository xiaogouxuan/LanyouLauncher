import { invoke } from "@tauri-apps/api/core";
import type { ModInfo, ModVersionInfo } from "@/types/mod";

/** 搜索结果短时缓存：首页与探索页共用，避免重复请求拖慢界面 */
const SEARCH_CACHE_TTL = 60_000;
const searchCache = new Map<string, { time: number; data: ModInfo[] }>();

export const modService = {
  async searchModrinth(
    query: string,
    version?: string,
    loader?: string,
  ): Promise<ModInfo[]> {
    const key = `modrinth|${query}|${version ?? ""}|${loader ?? ""}`;
    const cached = searchCache.get(key);
    if (cached && Date.now() - cached.time < SEARCH_CACHE_TTL) {
      return cached.data;
    }
    const data = await invoke<ModInfo[]>("search_modrinth", { query, version, loader });
    searchCache.set(key, { time: Date.now(), data });
    return data;
  },

  async getRecommendations(): Promise<ModInfo[]> {
    return this.searchModrinth("");
  },

  async getModDetails(modId: string, source: string): Promise<ModInfo> {
    return invoke<ModInfo>("get_mod_details", { modId, source });
  },

  async searchCurseForge(
    query: string,
    version?: string,
    loader?: string,
  ): Promise<ModInfo[]> {
    return invoke<ModInfo[]>("search_curseforge", { query, version, loader });
  },

  async getModVersions(
    modId: string,
    source: string,
    version?: string,
    loader?: string,
  ): Promise<ModVersionInfo[]> {
    return invoke<ModVersionInfo[]>("get_mod_versions", { modId, source, version, loader });
  },

  async downloadMod(
    modId: string,
    source: string,
    versionId: string,
    targetVersion?: string,
  ): Promise<void> {
    return invoke("download_mod", { modId, source, versionId, targetVersion });
  },

  async downloadModToLocal(
    modId: string,
    source: string,
    versionId: string,
    fileName: string,
  ): Promise<string> {
    return invoke<string>("download_mod_to_local", { modId, source, versionId, fileName });
  },

  async getInstalledMods(targetVersion?: string): Promise<ModInfo[]> {
    return invoke<ModInfo[]>("get_installed_mods", { targetVersion });
  },

  /** 用文件哈希识别本地 Mod，补齐图标、简介、项目 ID 等信息 */
  async identifyInstalledMods(targetVersion?: string): Promise<ModInfo[]> {
    return invoke<ModInfo[]>("identify_installed_mods", { targetVersion });
  },

  async toggleMod(modId: string, enabled: boolean, targetVersion?: string): Promise<void> {
    return invoke("toggle_mod", { modId, enabled, targetVersion });
  },

  async deleteMod(modId: string, targetVersion?: string): Promise<void> {
    return invoke("delete_mod", { modId, targetVersion });
  },

  async openModsDir(targetVersion?: string): Promise<void> {
    return invoke("open_mods_dir", { targetVersion });
  },
};
