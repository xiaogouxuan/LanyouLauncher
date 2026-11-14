/**
 * EasyTier 联机日志
 */
export interface EasytierLogEntry {
  level: string;
  message: string;
  timestamp: number;
}

/**
 * EasyTier 联机状态
 */
export interface EasytierStatus {
  installed: boolean;
  version: string;
  running: boolean;
  pid: number | null;
  network_name: string;
  virtual_ip: string;
  auto_ip: boolean;
  started_at: number | null;
  detected_ip: string | null;
  /** 本次连接模式：relay = 中转，p2p = 直连兜底 */
  mode: string;
  logs: EasytierLogEntry[];
}

/**
 * EasyTier 联机启动参数
 */
export interface EasytierConfig {
  network_name: string;
  network_secret: string;
  peers: string[];
  virtual_ip: string;
  /** auto（中转优先，默认）/ relay / p2p */
  mode?: string;
}

/** 单项联机自检结果 */
export interface EasytierCheck {
  id: string;
  status: "ok" | "warn" | "error";
  detail: string;
  fixable: boolean;
}

/** 联机自检报告 */
export interface EasytierDiagnostics {
  checks: EasytierCheck[];
  recommended_mode: "relay" | "p2p";
}

/** 局域网广播中发现的世界 */
export interface LanWorld {
  motd: string;
  port: number;
}

/**
 * EasyTier 核心组件安装结果
 */
export interface EasytierInstallInfo {
  installed: boolean;
  version: string;
  path: string;
}
