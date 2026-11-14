import { invoke } from "@tauri-apps/api/core";
import type {
  EasytierConfig,
  EasytierDiagnostics,
  EasytierInstallInfo,
  EasytierStatus,
  LanWorld,
} from "../types/easytier";

/**
 * EasyTier 联机服务
 */
export const easytierService = {
  /**
   * 获取联机状态与日志
   */
  getStatus: () => invoke<EasytierStatus>("get_easytier_status"),

  /**
   * 下载并安装 EasyTier 核心组件
   */
  install: () => invoke<EasytierInstallInfo>("install_easytier"),

  /**
   * 启动联机
   */
  start: (config: EasytierConfig) =>
    invoke<EasytierStatus>("start_easytier", { config }),

  /**
   * 停止联机
   */
  stop: () => invoke<EasytierStatus>("stop_easytier"),

  /**
   * 清空联机日志
   */
  clearLogs: () => invoke<void>("clear_easytier_logs"),

  /**
   * 测试中转服务器延迟（毫秒）
   */
  pingServer: (peer: string) =>
    invoke<number>("ping_easytier_server", { peer }),

  /**
   * 联机环境自检（核心、中转、端口、权限、网卡）
   */
  getDiagnostics: () => invoke<EasytierDiagnostics>("get_easytier_diagnostics"),

  /**
   * 监听游戏局域网广播，识别真实端口
   */
  discoverLanWorlds: (timeoutMs?: number) =>
    invoke<LanWorld[]>("discover_lan_worlds", { timeoutMs }),
};
