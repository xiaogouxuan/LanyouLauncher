import { invoke } from "@tauri-apps/api/core";

/**
 * 局域网桥接。
 *
 * 原版游戏在局域网列表里双击进入不会校验正版，
 * 但组播广播传不过联机的虚拟网络，客人在自己那边搜不到房间。
 * 后端会在本机起一个 TCP 转发，并把代理端口伪装成局域网广播，
 * 这样客人只需要在「多人游戏 → 局域网游戏」里双击出现的房间即可。
 */
export const lanBridgeService = {
  /** 开启桥接，返回本机代理端口 */
  start(host: string, port: number, motd?: string): Promise<number> {
    return invoke<number>("start_lan_bridge", { host, port, motd });
  },

  /** 关闭桥接 */
  stop(): Promise<void> {
    return invoke("stop_lan_bridge");
  },
};
