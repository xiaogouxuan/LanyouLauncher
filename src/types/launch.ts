export interface LaunchConfig {
  version_id: string;
  account_id: string;
  memory_min: number;
  memory_max: number;
  jvm_args: string[];
  resolution_width: number;
  resolution_height: number;
  java_path: string;
  game_dir: string | null;
}

export interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
  timestamp: number;
}

export interface LaunchProgress {
  step: number;
  total: number;
  label: string;
}