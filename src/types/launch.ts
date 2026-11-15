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

/** 游戏崩溃信息，由后端读取崩溃报告 / 日志后汇总 */
export interface CrashInfo {
  pid: number;
  version_id: string;
  /** 游戏目录，弹窗里可一键打开 */
  game_dir: string;
  /** 退出代码，被系统强杀时可能为空 */
  exit_code: number | null;
  /** 一句话原因，可能为空 */
  summary: string;
  /** 崩溃报告或日志摘要 */
  details: string;
  /** 崩溃报告路径 */
  report_path: string | null;
  /** latest.log 末尾若干行 */
  log_tail: string[];
}