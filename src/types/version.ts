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
  lore?: string;
}

export interface DownloadProgress {
  id: string;
  task_type: string;
  total: number;
  current: number;
  status: string;
  speed?: number; // bytes per second
  stage?: string; // current stage key
}