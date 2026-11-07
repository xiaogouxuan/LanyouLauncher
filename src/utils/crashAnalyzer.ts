export type CrashCategory =
  | "outOfMemory"
  | "javaVersion"
  | "modConflict"
  | "versionCorrupt"
  | "graphics"
  | "network"
  | "permission"
  | "generic";

interface CrashRule {
  category: CrashCategory;
  patterns: RegExp[];
}

const RULES: CrashRule[] = [
  {
    category: "outOfMemory",
    patterns: [
      /java\.lang\.outofmemoryerror/,
      /insufficient memory/,
      /could not reserve enough space/,
      /failed to allocate memory/,
    ],
  },
  {
    category: "javaVersion",
    patterns: [
      /unsupportedclassversionerror/,
      /class file version/,
      /only recognizes class file versions/,
      /java version .* (required|needed)/,
      /requires java (8|11|17|21)/,
    ],
  },
  {
    category: "versionCorrupt",
    patterns: [
      /could not find or load main class/,
      /invalid or corrupt jarfile/,
      /zip file is empty/,
      /error opening zip file/,
      /unable to access jarfile/,
    ],
  },
  {
    category: "modConflict",
    patterns: [
      /incompatible mod set/,
      /mod resolution (failed|encountered)/,
      /mixin apply failed/,
      /mixin.*(failed|error)/,
      /missing (mod )?dependenc/,
      /duplicate mods/,
      /no class def found/,
      /no such method/,
      /mod .* requires/,
    ],
  },
  {
    category: "graphics",
    patterns: [
      /glfw error/,
      /failed to create window/,
      /could not initialize opengl/,
      /pixel format/,
      /unsupported.*graphics/,
      /update your graphics driver/,
      /wgl.*failed/,
    ],
  },
  {
    category: "network",
    patterns: [
      /unknownhostexception/,
      /connect timed out/,
      /connection refused/,
      /sslhandshakeexception/,
      /failed to download/,
      /could not connect to/,
    ],
  },
  {
    category: "permission",
    patterns: [
      /accessdeniedexception/,
      /permission denied/,
      /access is denied/,
      /拒绝访问/,
    ],
  },
  {
    category: "generic",
    patterns: [
      /the game crashed/,
      /exception in thread/,
      /exit code (was )?[1-9]/,
      /游戏已退出/,
    ],
  },
];

/**
 * 根据启动错误或游戏日志推断失败原因，返回 i18n 分类键。
 * 匹配不到任何已知特征时返回 "generic"，空输入返回 null。
 */
export function analyzeCrash(text: string | null | undefined): CrashCategory | null {
  if (!text) return null;
  const normalized = text.toLowerCase();
  if (!normalized.trim()) return null;

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return rule.category;
    }
  }
  return "generic";
}
