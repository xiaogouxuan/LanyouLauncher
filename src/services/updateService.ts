import { invoke } from "@tauri-apps/api/core";

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
}

export const updateService = {
  async checkUpdate(): Promise<GitHubRelease | null> {
    return invoke<GitHubRelease | null>("check_update");
  },
};