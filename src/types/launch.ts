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
  /** 联机一键进服地址，例如 10.126.126.1:25565 */
  server_address?: string | null;
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

export interface LaunchInstance {
  pid: number;
  version_id: string;
  startTime: number;
}