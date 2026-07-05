import { t } from "@/i18n/useTranslation";
import { useUIStore } from "@/stores/uiStore";

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

export const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return t("time.minutesAgo", { count: String(minutes) });
    }
    return t("time.hoursAgo", { count: String(hours) });
  }
  if (days < 7) {
    return t("time.daysAgo", { count: String(days) });
  }

  const language = useUIStore.getState().language;
  return date.toLocaleDateString(language, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

export function formatError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    if ("message" in error) return String((error as { message: unknown }).message);
    return JSON.stringify(error);
  }
  return String(error);
}

export const formatMemory = (mb: number): string => {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
};