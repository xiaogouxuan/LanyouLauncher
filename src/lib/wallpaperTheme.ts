/** 内置壁纸与配套主题色：主题色取自壁纸主色调，切换壁纸时整体界面同步换色 */
export const BUILTIN_WALLPAPERS = [
  {
    id: "img1",
    nameKey: "settings.wallpaperTwilightOverworld",
    themeColor: "#C96A22",
  },
  {
    id: "img2",
    nameKey: "settings.wallpaperWhiskersInClouds",
    themeColor: "#7B68D9",
  },
  {
    id: "img3",
    nameKey: "settings.wallpaperWhisperingWilds",
    themeColor: "#3E9569",
  },
  {
    id: "img4",
    nameKey: "settings.wallpaperMoonlitLakeside",
    themeColor: "#4568CC",
  },
] as const;

/** 早期版本使用过的默认主题色，用于把老用户的壁纸主题色自动迁移到新配色 */
const LEGACY_DEFAULT_THEME_COLORS = ["#2f6bff", "#1370f3"];

export function builtinWallpaperThemeColor(wallpaper: string): string | null {
  return BUILTIN_WALLPAPERS.find((item) => item.id === wallpaper)?.themeColor ?? null;
}

export function isLegacyDefaultThemeColor(color: string): boolean {
  return LEGACY_DEFAULT_THEME_COLORS.includes(color.trim().toLowerCase());
}

/**
 * 纯色壁纸也能当主题色，但过亮时白色按钮文字会看不清，这里把亮度压到可用范围。
 */
export function accessibleAccent(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;

  let { r, g, b } = rgb;
  let guard = 0;
  while (relativeLuminance(r, g, b) > 0.3 && guard < 12) {
    r *= 0.92;
    g *= 0.92;
    b *= 0.92;
    guard += 1;
  }
  return toHex(r, g, b);
}

function parseHex(hex: string) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return null;
  const value = parseInt(clean, 16);
  if (Number.isNaN(value)) return null;
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function relativeLuminance(r: number, g: number, b: number) {
  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function toHex(r: number, g: number, b: number) {
  const part = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}
