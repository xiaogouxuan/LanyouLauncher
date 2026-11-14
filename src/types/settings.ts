export type ThemeMode = "light" | "dark" | "system";
export type DownloadSource = "official" | "bmclapi";
export type UIMaterial = "solid" | "frosted" | "liquid";

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
  /** 主题色是否跟随内置壁纸：选壁纸时为 true，手动选色后自动关闭 */
  theme_color_auto: boolean;
  ui_material: UIMaterial;
  close_after_launch: boolean;
}