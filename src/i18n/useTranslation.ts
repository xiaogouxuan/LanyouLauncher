import { useUIStore } from "@/stores/uiStore";
import zhCN from "@/i18n/locales/zh-CN.json";
import enUS from "@/i18n/locales/en-US.json";

const locales: Record<string, Record<string, unknown>> = {
  "zh-CN": zhCN as unknown as Record<string, unknown>,
  "en-US": enUS as unknown as Record<string, unknown>,
};

export function t(key: string, params?: Record<string, string>): string;
export function t(key: string, params: Record<string, unknown> & { returnObjects: true }): unknown;
export function t(key: string, params?: Record<string, unknown>): unknown {
  const language = useUIStore.getState().language;
  const locale = locales[language] || locales["zh-CN"];
  const keys = key.split(".");
  let result: unknown = locale;
  for (const k of keys) {
    if (result && typeof result === "object" && k in result) {
      result = (result as Record<string, unknown>)[k];
    } else {
      return key;
    }
  }

  // 如果请求返回对象（如数组），直接返回
  if (params?.returnObjects === true) {
    return result;
  }

  let text = typeof result === "string" ? result : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (k === "returnObjects") continue;
      text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
    }
  }
  return text;
}

export function useTranslation() {
  const language = useUIStore((s) => s.language);
  return { t, language };
}
