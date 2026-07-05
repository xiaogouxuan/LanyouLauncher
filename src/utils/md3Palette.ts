// 简化的 Material Design 3 调色板生成器
// 基于 HSL 色彩空间，从种子色生成 primary/secondary/tertiary/error 的 13 级色调变体
// 对于启动器场景足够表达 MD3 Expressive 的色彩层级

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface MD3Palette {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  outline: string;
  outlineVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  scrim: string;
  shadow: string;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return null;
  const bigint = parseInt(clean, 16);
  if (Number.isNaN(bigint)) return null;
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function rgbToHsl(rgb: { r: number; g: number; b: number }): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(hsl: HSL): string {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;
  let r: number;
  let g: number;
  let b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (c: number) =>
    Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// 将 MD3 tone（感知明度）近似映射到 HSL lightness
function toneToLightness(tone: number): number {
  const map: Record<number, number> = {
    0: 0,
    10: 8,
    20: 18,
    30: 31,
    40: 44,
    50: 56,
    60: 67,
    70: 78,
    80: 88,
    90: 94,
    95: 97,
    99: 99,
    100: 100,
  };
  const tones = Object.keys(map).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < tones.length - 1; i++) {
    const t1 = tones[i];
    const t2 = tones[i + 1];
    if (tone >= t1 && tone <= t2) {
      const ratio = (tone - t1) / (t2 - t1);
      return map[t1] + (map[t2] - map[t1]) * ratio;
    }
  }
  return map[100];
}

function colorAtTone(base: HSL, tone: number, chromaBoost = 1): string {
  const lightness = toneToLightness(tone);
  // 低 tone 时降低饱和度，避免颜色过脏；高 tone 时略微降饱和
  let saturation = base.s * chromaBoost;
  if (tone <= 20) saturation *= 0.6;
  else if (tone >= 95) saturation *= 0.3;
  else if (tone >= 90) saturation *= 0.5;
  else if (tone >= 80) saturation *= 0.7;
  return hslToHex({
    h: base.h,
    s: Math.min(100, Math.max(0, saturation)),
    l: lightness,
  });
}

function neutralAtTone(tone: number, isDark: boolean): string {
  // 中性色使用极低饱和度，保持温暖/冷淡取决于主题
  const baseHue = isDark ? 220 : 30;
  const saturation = isDark ? 4 : 3;
  return hslToHex({
    h: baseHue,
    s: saturation,
    l: toneToLightness(tone),
  });
}

function neutralVariantAtTone(tone: number, isDark: boolean): string {
  const baseHue = isDark ? 220 : 40;
  const saturation = isDark ? 6 : 5;
  return hslToHex({
    h: baseHue,
    s: saturation,
    l: toneToLightness(tone),
  });
}

export function generateMd3Palette(seedColor: string, isDark: boolean): MD3Palette {
  const rgb = hexToRgb(seedColor) || { r: 59, g: 130, b: 246 };
  const seedHsl = rgbToHsl(rgb);

  const primaryHsl = seedHsl;
  const secondaryHsl = { ...seedHsl, h: (seedHsl.h + 20) % 360 };
  const tertiaryHsl = { ...seedHsl, h: (seedHsl.h + 60) % 360 };
  const errorHsl = { h: 25, s: 92, l: 55 };

  if (isDark) {
    return {
      primary: colorAtTone(primaryHsl, 80),
      onPrimary: colorAtTone(primaryHsl, 20),
      primaryContainer: colorAtTone(primaryHsl, 30),
      onPrimaryContainer: colorAtTone(primaryHsl, 90),
      secondary: colorAtTone(secondaryHsl, 80),
      onSecondary: colorAtTone(secondaryHsl, 20),
      secondaryContainer: colorAtTone(secondaryHsl, 30),
      onSecondaryContainer: colorAtTone(secondaryHsl, 90),
      tertiary: colorAtTone(tertiaryHsl, 80),
      onTertiary: colorAtTone(tertiaryHsl, 20),
      tertiaryContainer: colorAtTone(tertiaryHsl, 30),
      onTertiaryContainer: colorAtTone(tertiaryHsl, 90),
      error: colorAtTone(errorHsl, 80),
      onError: colorAtTone(errorHsl, 20),
      errorContainer: colorAtTone(errorHsl, 30),
      onErrorContainer: colorAtTone(errorHsl, 90),
      surface: neutralAtTone(6, true),
      onSurface: neutralAtTone(90, true),
      surfaceVariant: neutralVariantAtTone(30, true),
      onSurfaceVariant: neutralVariantAtTone(80, true),
      surfaceContainerLowest: neutralAtTone(4, true),
      surfaceContainerLow: neutralAtTone(10, true),
      surfaceContainer: neutralAtTone(12, true),
      surfaceContainerHigh: neutralAtTone(17, true),
      surfaceContainerHighest: neutralAtTone(22, true),
      outline: neutralVariantAtTone(60, true),
      outlineVariant: neutralVariantAtTone(30, true),
      inverseSurface: neutralAtTone(90, true),
      inverseOnSurface: neutralAtTone(10, true),
      inversePrimary: colorAtTone(primaryHsl, 40),
      scrim: "rgba(0, 0, 0, 0.32)",
      shadow: "rgba(0, 0, 0, 0.3)",
    };
  }

  return {
    primary: colorAtTone(primaryHsl, 40),
    onPrimary: colorAtTone(primaryHsl, 100),
    primaryContainer: colorAtTone(primaryHsl, 90),
    onPrimaryContainer: colorAtTone(primaryHsl, 10),
    secondary: colorAtTone(secondaryHsl, 40),
    onSecondary: colorAtTone(secondaryHsl, 100),
    secondaryContainer: colorAtTone(secondaryHsl, 90),
    onSecondaryContainer: colorAtTone(secondaryHsl, 10),
    tertiary: colorAtTone(tertiaryHsl, 40),
    onTertiary: colorAtTone(tertiaryHsl, 100),
    tertiaryContainer: colorAtTone(tertiaryHsl, 90),
    onTertiaryContainer: colorAtTone(tertiaryHsl, 10),
    error: colorAtTone(errorHsl, 40),
    onError: colorAtTone(errorHsl, 100),
    errorContainer: colorAtTone(errorHsl, 90),
    onErrorContainer: colorAtTone(errorHsl, 10),
    surface: neutralAtTone(98, false),
    onSurface: neutralAtTone(10, false),
    surfaceVariant: neutralVariantAtTone(90, false),
    onSurfaceVariant: neutralVariantAtTone(30, false),
    surfaceContainerLowest: neutralAtTone(100, false),
    surfaceContainerLow: neutralAtTone(96, false),
    surfaceContainer: neutralAtTone(94, false),
    surfaceContainerHigh: neutralAtTone(92, false),
    surfaceContainerHighest: neutralAtTone(90, false),
    outline: neutralVariantAtTone(50, false),
    outlineVariant: neutralVariantAtTone(80, false),
    inverseSurface: neutralAtTone(20, false),
    inverseOnSurface: neutralAtTone(95, false),
    inversePrimary: colorAtTone(primaryHsl, 80),
    scrim: "rgba(0, 0, 0, 0.32)",
    shadow: "rgba(0, 0, 0, 0.2)",
  };
}

export function applyMd3PaletteToRoot(seedColor: string, isDark: boolean) {
  const palette = generateMd3Palette(seedColor, isDark);
  const root = document.documentElement;

  Object.entries(palette).forEach(([key, value]) => {
    root.style.setProperty(`--md-sys-color-${key}`, value);
  });
}
