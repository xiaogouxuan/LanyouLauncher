import type { LoaderType } from "./version";

export type ModSource = "Modrinth" | "CurseForge";

export interface ModDependency {
  id: string;
  name: string;
  required: boolean;
}

export interface ModInfo {
  id: string;
  name: string;
  version: string;
  version_id: string;
  loader: LoaderType;
  game_version: string;
  description: string;
  icon_url: string | null;
  source: ModSource;
  enabled: boolean;
  dependencies: ModDependency[];
}

export interface ModFilter {
  version?: string;
  loader?: LoaderType;
}