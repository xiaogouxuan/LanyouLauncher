import { t } from "@/i18n/useTranslation";

/**
 * 后端通过 I18nError 返回的 JSON 结构。
 * key 对应 i18n 语言文件中的键，params 用于替换 {{param}} 占位符。
 */
interface I18nErrorPayload {
  key: string;
  params?: Record<string, string>;
}

/**
 * 解析后端返回的国际化错误。
 * 如果 error 是 I18nError 序列化后的 JSON，则按 key 翻译；
 * 否则尝试把纯文本当作 key 查找翻译；
 * 都失败时原样返回。
 */
export function parseI18nError(error: unknown, fallbackKey = "common.error"): string {
  if (typeof error !== "string") {
    return t(fallbackKey);
  }

  try {
    const payload: I18nErrorPayload = JSON.parse(error);
    if (payload.key) {
      return t(payload.key, payload.params);
    }
  } catch {
    // 不是 JSON 错误，按普通文本处理
  }

  // 尝试把纯字符串当作 key 翻译
  if (/^[a-z][a-zA-Z0-9.]*$/.test(error)) {
    const translated = t(error);
    if (translated !== error) {
      return translated;
    }
  }

  return error;
}

/** 判断错误字符串是否为 I18nError 序列化后的 JSON。 */
export function isI18nError(error: unknown): error is string {
  return typeof error === "string" && error.startsWith('{"key"');
}
