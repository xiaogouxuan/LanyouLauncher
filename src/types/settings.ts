export type ThemeMode = "light" | "dark" | "system";
export type DownloadSource = "official" | "bmclapi";

export interface Settings {
  language: string;
  theme: ThemeMode;
  download_source: DownloadSource;
  java_paths: string[];
  default_memory: number;
  default_game_dir: string;
  auto_update: boolean;
  wallpaper: string;
  background_image: string;
  background_opacity: number;
  background_blur: number;
  theme_color: string;
  close_after_launch: boolean;
}