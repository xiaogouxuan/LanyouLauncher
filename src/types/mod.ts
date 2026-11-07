import type { LoaderType } from "./version";

export type ModSource = "Modrinth" | "CurseForge";

export interface ModDependency {
  id: string;
  name: string;
  required: boolean;
}

export interface ModInfo {
  id: string;
  project_id?: string;
  name: string;
  version: string;
  version_id: string;
  file_name?: string;
  loader: LoaderType;
  game_version: string;
  description: string;
  icon_url: string | null;
  source: ModSource;
  enabled: boolean;
  dependencies: ModDependency[];
  /** 安装路径（仅已安装 Mod 有效） */
  install_path?: string;
  /** 所属实例 ID（全局 mods 为 "global"） */
  instance_id?: string;
  /** 是否安装在版本隔离目录 */
  is_isolated?: boolean;
}

export interface ModVersionInfo {
  version_id: string;
  version_number: string;
  game_versions: string[];
  loaders: LoaderType[];
  file_name: string;
  file_size: number;
  download_url: string;
  dependencies: ModDependency[];
}

export interface ModFilter {
  version?: string;
  loader?: LoaderType;
}
