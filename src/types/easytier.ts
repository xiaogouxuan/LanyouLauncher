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
}

/**
 * EasyTier 核心组件安装结果
 */
export interface EasytierInstallInfo {
  installed: boolean;
  version: string;
  path: string;
}
