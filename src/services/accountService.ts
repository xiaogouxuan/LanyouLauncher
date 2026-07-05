import { invoke } from "@tauri-apps/api/core";
import type { Account } from "@/types/account";

export const accountService = {
  async getAccounts(): Promise<Account[]> {
    return invoke<Account[]>("get_accounts");
  },

  async loginOffline(username: string): Promise<Account> {
    return invoke<Account>("login_offline", { username });
  },

  async loginMicrosoft(windowTitle: string): Promise<Account> {
    return invoke<Account>("login_microsoft", { windowTitle });
  },

  async deleteAccount(id: string): Promise<void> {
    return invoke("delete_account", { id });
  },

  async switchAccount(id: string): Promise<void> {
    return invoke("switch_account", { id });
  },

  async refreshToken(id: string): Promise<Account> {
    return invoke<Account>("refresh_token", { id });
  },

  async selectAccountSkin(id: string): Promise<string | null> {
    return invoke<string | null>("select_account_skin", { id });
  },

  async clearAccountSkin(id: string): Promise<void> {
    return invoke("clear_account_skin", { id });
  },

  /** 读取本地皮肤文件并返回 base64 data URL（convertFileSrc 的兜底） */
  async readSkinDataUrl(path: string): Promise<string> {
    return invoke<string>("read_skin_data_url", { path });
  },
};