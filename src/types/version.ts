export type VersionType =
  | "Release"
  | "Snapshot"
  | "PreRelease"
  | "ReleaseCandidate"
  | "OldBeta"
  | "OldAlpha"
  | "Pending"
  | "AprilFools"
  | "Unobfuscated";
export type LoaderType = "Forge" | "Fabric" | "NeoForge" | "Quilt";

export interface VersionInfo {
  id: string;
  version_type: VersionType;
  release_time: string;
  loader: LoaderType | null;
  install_time: number | null;
  is_isolated: boolean;
  game_dir: string | null;
  java_path?: string;
  lore?: string;
  loader_history?: Partial<Record<LoaderType, string>>;
}

export interface LoaderVersionInfo {
  version: string;
  is_recommended: boolean;
  is_latest: boolean;
}

export interface DownloadProgress {
  id: string;
  task_type: string;
  total: number;
  current: number;
  status: string;

  // 下载速度，单位字节每秒
  speed?: number;

  // 当前阶段标识，用于前端展示下载进度文案
  stage?: string;
}

export type ExportContentKey =
  | "manifest"
  | "versionJson"
  | "assets"
  | "libraries"
  | "mods"
  | "saves"
  | "options"
  | "resourcepacks"
  | "shaderpacks"
  | "config";

export interface ExportOption {
  key: ExportContentKey;
  label: string;
  checked: boolean;
}

/** 整合包导入格式，auto 为自动识别（推荐） */
export type ModpackFormat = "auto" | "curseforge" | "modrinth" | "lanyou";

/** 整合包导入进度事件 */
export interface ModpackImportProgress {
  stage: "prepare" | "version" | "loader" | "extract" | "mods" | "finish";
  current: number;
  total: number;
  message: string;
}

/** 整合包导入结果 */
export interface ImportedModpack {
  version_id: string;
  name: string;
  game_version: string;
  loader: LoaderType | null;
  loader_version: string | null;
  mods_installed: number;
  mods_failed: number;
}