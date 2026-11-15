import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Copy, Check, FolderOpen } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/i18n";
import { useLaunchStore } from "@/stores/launchStore";
import { analyzeCrash } from "@/utils/crashAnalyzer";
import { settingsService } from "@/services/settingsService";

/**
 * 游戏崩溃弹窗。
 *
 * 以前进程一退出就只剩一个空窗口，用户得自己去翻 latest.log 才知道原因。
 * 现在后端会把 crash-report / latest.log 里的关键内容一起带上来，
 * 这里直接给出分类原因、退出代码和可复制的详情。
 */
export function CrashDialog() {
  const { t } = useTranslation();
  const crash = useLaunchStore((s) => s.crash);
  const clearCrash = useLaunchStore((s) => s.clearCrash);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!crash) return null;

  const category =
    analyzeCrash([crash.summary, crash.details, crash.log_tail.join("\n")].join("\n")) ?? "generic";

  const reportText = () => {
    const parts: string[] = [];
    parts.push(t("crash.export.version", { version: crash.version_id || "-" }));
    if (crash.exit_code !== null) {
      parts.push(t("crash.export.exitCode", { code: String(crash.exit_code) }));
    }
    if (crash.summary) {
      parts.push(t("crash.export.reason", { reason: crash.summary }));
    }
    if (crash.report_path) {
      parts.push(t("crash.export.reportPath", { path: crash.report_path }));
    }
    if (crash.details) {
      parts.push("", "===== " + t("crash.detailsTitle") + " =====", crash.details);
    }
    if (crash.log_tail.length > 0) {
      parts.push("", "===== " + t("crash.logTitle") + " =====", crash.log_tail.join("\n"));
    }
    return parts.join("\n");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用时保持静默，用户仍可手动选中文本
    }
  };

  const handleOpenGameDir = () => {
    settingsService.openGameDir(crash.game_dir || undefined).catch(() => {});
  };

  const handleClose = () => {
    setShowDetails(false);
    setCopied(false);
    clearCrash();
  };

  const hasDetails = Boolean(crash.details) || crash.log_tail.length > 0;

  return (
    <Modal open onClose={handleClose} title={String(t("crash.dialogTitle"))}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-container text-danger">
          <AlertTriangle size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-on-surface">
            {String(t(`crash.${category}.title`))}
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-on-surface-variant">
            {String(t(`crash.${category}.advice`))}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-[8px] border border-outline-variant bg-surface-container/60 px-3 py-2.5 space-y-1">
        <div className="flex items-center justify-between gap-3 text-[10.5px] text-on-surface-subtle">
          <span className="truncate">{t("crash.export.version", { version: crash.version_id || "-" })}</span>
          {crash.exit_code !== null && (
            <span className="shrink-0 tabular-nums">
              {t("crash.exitCodeShort", { code: String(crash.exit_code) })}
            </span>
          )}
        </div>
        <p className="break-words font-mono text-[11.5px] leading-relaxed text-on-surface">
          {crash.summary || String(t("crash.unknownReason"))}
        </p>
        {crash.report_path && (
          <p className="truncate text-[10.5px] text-on-surface-subtle" title={crash.report_path}>
            {t("crash.reportPath", { path: crash.report_path })}
          </p>
        )}
      </div>

      {hasDetails && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            className="flex items-center gap-1 rounded-btn px-1 py-1 text-[11px] text-on-surface-variant hover:text-on-surface transition-colors"
          >
            {showDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showDetails ? t("crash.hideDetails") : t("crash.showDetails")}
          </button>
          {showDetails && (
            <pre className="mt-1 max-h-[220px] overflow-auto rounded-[6px] bg-surface-low px-2.5 py-2 text-[10.5px] leading-[1.5] text-on-surface-variant whitespace-pre-wrap break-all">
              {crash.details || crash.log_tail.join("\n")}
            </pre>
          )}
        </div>
      )}

      <p className="mt-3 text-[10.5px] leading-relaxed text-on-surface-subtle">
        {t("crash.footerHint")}
      </p>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="text" size="sm" onClick={handleOpenGameDir}>
          <FolderOpen size={13} />
          {t("crash.openGameDir")}
        </Button>
        <Button variant="text" size="sm" onClick={handleCopy}>
          {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
          {copied ? t("crash.copied") : t("crash.copyDetails")}
        </Button>
        <Button size="sm" onClick={handleClose}>
          {t("common.close")}
        </Button>
      </div>
    </Modal>
  );
}
