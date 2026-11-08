import { useEffect, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { Calendar, Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useTranslation } from "@/i18n";
import { updateService, type UpdateRelease } from "@/services/updateService";
import { APP_VERSION } from "@/utils/constants";
import { formatError } from "@/utils/format";
import { openUrl } from "@/utils/openUrl";

interface UpdateDialogProps {
  open: boolean;
  release: UpdateRelease | null;
  onClose: () => void;
}

type Phase = "idle" | "downloading" | "installing" | "error";

/** 把 ISO 时间转成 YYYY-MM-DD */
function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * 新版本提示弹窗：展示版本号与更新日志，确认后自动下载并重启
 */
export function UpdateDialog({ open, release, onClose }: UpdateDialogProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setPhase("idle");
      setPercent(0);
      setError("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let unlisten: UnlistenFn | undefined;
    let disposed = false;

    updateService
      .onProgress(({ downloaded, total }) => {
        if (total > 0) {
          setPercent(Math.min(100, Math.round((downloaded / total) * 100)));
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [open]);

  if (!release) return null;

  const busy = phase === "downloading" || phase === "installing";
  const downloadUrl = release.download_url || release.html_url;
  const publishedAt = formatDate(release.published_at);
  const sourceLabel =
    release.source === "gitee"
      ? t("update.sourceGitee")
      : t("update.sourceGithub");

  const handleManualDownload = () => {
    openUrl(downloadUrl).catch(() => {
      showToast("error", t("errors.system.openUrlFailed", { detail: downloadUrl }));
    });
  };

  const handleUpdate = async () => {
    if (!release.download_url) {
      handleManualDownload();
      return;
    }

    setPhase("downloading");
    setPercent(0);
    setError("");
    try {
      await updateService.installUpdate(release.download_url);
      setPhase("installing");
    } catch (err) {
      setPhase("error");
      setError(formatError(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={t("update.title")}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2.5 rounded-card border border-outline-variant bg-surface px-3.5 py-3">
          <span className="w-8 h-8 rounded-btn bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Sparkles size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-on-surface-subtle">
              {t("update.currentVersion")} {APP_VERSION}
            </p>
            <p className="text-[14px] font-semibold text-on-surface mt-0.5 truncate">
              {release.tag_name}
            </p>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium shrink-0">
            {sourceLabel}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-on-surface-subtle px-0.5">
          <span className="inline-flex items-center gap-1">
            <Calendar size={12} />
            {t("update.publishedAt")} {publishedAt || "-"}
          </span>
        </div>

        <div>
          <p className="text-[12px] font-medium text-on-surface mb-1.5">
            {t("update.changelog")}
          </p>
          <div className="max-h-52 overflow-y-auto rounded-btn border border-outline-variant bg-surface px-3 py-2.5 text-[12px] leading-relaxed text-on-surface-variant whitespace-pre-wrap break-words">
            {release.body.trim() || t("update.noChangelog")}
          </div>
        </div>

        {busy && (
          <div className="space-y-1.5">
            <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${phase === "installing" ? 100 : percent}%` }}
              />
            </div>
            <p className="text-[11px] text-on-surface-subtle">
              {phase === "installing"
                ? t("update.installing")
                : t("update.downloading", { percent: String(percent) })}
            </p>
          </div>
        )}

        {phase === "error" && (
          <p className="text-[11px] text-danger leading-relaxed break-words">
            {t("update.updateFailed", { detail: error })}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-4">
        {busy ? (
          <Button variant="filled" size="md" loading disabled>
            {phase === "installing" ? t("update.installing") : t("update.downloading", { percent: String(percent) })}
          </Button>
        ) : phase === "error" ? (
          <>
            <Button variant="text" size="md" onClick={onClose}>
              {t("update.later")}
            </Button>
            <Button variant="tonal" size="md" onClick={handleManualDownload}>
              {t("update.manualDownload")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="text" size="md" onClick={onClose}>
              {t("update.later")}
            </Button>
            <Button variant="filled" size="md" onClick={() => void handleUpdate()}>
              <Download size={14} />
              {t("update.updateNow")}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
