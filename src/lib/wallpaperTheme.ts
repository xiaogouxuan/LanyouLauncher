/** 壁纸文字色调：light = 白字，dark = 深色字 */
export type TextTone = "light" | "dark";

export interface WallpaperTone {
  /** 顶部页面标题 */
  top: TextTone;
  /** 中部问候语 */
  mid: TextTone;
  /** 底部导航 */
  bottom: TextTone;
}

/**
 * 内置壁纸与配套主题色。
 * 每张壁纸取画面里最有代表性的色相作为主色，选中壁纸时整站主色一起切换；
 * 色值都压暗到白字仍可读的亮度，避免按钮文字发虚。
 *
 * tone 是按画面实际明暗预先测好的文字色调：
 * 取样失败（例如自定义壁纸读不到像素）时先用它打底，
 * 保证任何情况下都不会退回默认的深灰文字。
 */
export const BUILTIN_WALLPAPERS = [
  {
    // 落日压在湖面上，取夕照最深的一层橙
    id: "img1",
    nameKey: "settings.wallpaperSunsetLakeside",
    themeColor: "#C85E1C",
    // 顶部深色树林用白字，中部是明亮的夕照云层用深色字，底部湖面反光用白字
    tone: { top: "light", mid: "dark", bottom: "light" },
  },
  {
    // 晨雾笼罩的雪山湖，取雾气的紫蓝
    id: "img2",
    nameKey: "settings.wallpaperMistyMountainLake",
    themeColor: "#6B73C9",
    tone: { top: "light", mid: "dark", bottom: "light" },
  },
  {
    // 麦田与风车，取成熟麦穗的金棕
    id: "img3",
    nameKey: "settings.wallpaperGoldenHarvest",
    themeColor: "#A97A1F",
    tone: { top: "light", mid: "dark", bottom: "light" },
  },
  {
    // 晴日樱花，取花瓣的深粉
    id: "img4",
    nameKey: "settings.wallpaperCherryBlossom",
    themeColor: "#C8557F",
    // 这张整体是亮天，顶部标题和问候语都用深色字，底部草地仍然用白字
    tone: { top: "dark", mid: "dark", bottom: "light" },
  },
] as const;

/** 品牌蓝，也是没有壁纸时的默认主题色 */
export const BRAND_THEME_COLOR = "#2F6BFF";

export function builtinWallpaperThemeColor(wallpaper: string): string | null {
  return BUILTIN_WALLPAPERS.find((item) => item.id === wallpaper)?.themeColor ?? null;
}

export function builtinWallpaperTone(wallpaper: string): WallpaperTone | null {
  return BUILTIN_WALLPAPERS.find((item) => item.id === wallpaper)?.tone ?? null;
}
