import { useState, useEffect, useMemo } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { VersionIcon } from "@/components/game/VersionIcon";
import { EmptyState } from "@/components/common/EmptyState";
import { useTranslation } from "@/i18n";
import { modService } from "@/services/modService";
import { formatFileSize, formatError } from "@/utils/format";
import { useToast } from "@/components/ui/Toast";
import type { ModInfo, ModVersionInfo } from "@/types/mod";
import type { LoaderType } from "@/types/version";
import { Download, Package, HardDrive, CheckCircle2, AlertCircle } from "lucide-react";

interface ModVersionSelectorProps {
  mod: ModInfo | null;
  targetVersion?: string;
  gameVersion?: string;
  loader?: LoaderType;
  open: boolean;
  onClose: () => void;
  onInstall?: (version: ModVersionInfo) => void;
  onDownloadLocal?: (version: ModVersionInfo) => void;
}

export function ModVersionSelector({
  mod,
  targetVersion,
  gameVersion,
  loader,
  open,
  onClose,
  onInstall,
  onDownloadLocal,
}: ModVersionSelectorProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [versions, setVersions] = useState<ModVersionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<"install" | "local" | null>(null);

  useEffect(() => {
    if (!open || !mod) {
      setVersions([]);
      setSelectedId(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    modService
      .getModVersions(mod.project_id ?? mod.id, mod.source, gameVersion, loader)
      .then((data) => {
        if (cancelled) return;
        setVersions(data);
        if (data.length > 0) {
          setSelectedId(data[0].version_id);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        showToast("error", formatError(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, mod, gameVersion, loader, showToast]);

  const selectedVersion = useMemo(
    () => versions.find((v) => v.version_id === selectedId) || null,
    [versions, selectedId],
  );

  const handleInstall = async () => {
    if (!selectedVersion || !onInstall) return;
    setActionLoading("install");
    try {
      await onInstall(selectedVersion);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadLocal = async () => {
    if (!selectedVersion || !onDownloadLocal) return;
    setActionLoading("local");
    try {
      await onDownloadLocal(selectedVersion);
    } finally {
      setActionLoading(null);
    }
  };

  const renderVersionItem = (version: ModVersionInfo) => {
    const isSelected = version.version_id === selectedId;
    const requiredDeps = version.dependencies.filter((d) => d.required).length;

    return (
      <button
        key={version.version_id}
        type="button"
        onClick={() => setSelectedId(version.version_id)}
        className={`w-full text-left rounded-xl border p-3 transition-all ${
          isSelected
            ? "border-primary bg-primary-container/30"
            : "border-outline-variant bg-surface-container hover:bg-surface-container-high"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-on-surface">{version.version_number}</span>
              {isSelected && <CheckCircle2 size={14} className="text-primary" />}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {version.game_versions.slice(0, 4).map((gv) => (
                <Badge key={gv} variant="default" className="text-[10px]">
                  {gv}
                </Badge>
              ))}
              {version.game_versions.length > 4 && (
                <Badge variant="default" className="text-[10px]">
                  +{version.game_versions.length - 4}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-on-surface-variant">
              <span className="flex items-center gap-1">
                <HardDrive size={12} />
                {formatFileSize(version.file_size)}
              </span>
              {requiredDeps > 0 && (
                <span>
                  {t("mod.requiredDependency")}: {requiredDeps}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              {version.loaders.map((ld) => (
                <VersionIcon key={ld} loader={ld} size={18} />
              ))}
            </div>
          </div>
        </div>
      </button>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("mod.selectVersion")}
      className="max-w-[600px]"
    >
      <div className="space-y-4">
        {mod && (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            {mod.loader && <VersionIcon loader={mod.loader} size={18} />}
            <span>
              {t("mod.gameVersion")}: {gameVersion || t("mod.allVersions")}
            </span>
            {targetVersion && (
              <>
                <span className="mx-1">·</span>
                <span>
                  {t("mod.installTarget")}: {targetVersion}
                </span>
              </>
            )}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-on-surface-variant animate-pulse">
            {t("mod.fetchingVersions")}
          </div>
        ) : versions.length === 0 ? (
          <EmptyState
            icon={<AlertCircle size={32} className="text-on-surface-variant" />}
            title={t("common.noData")}
            description={t("mod.noCompatibleVersion")}
          />
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {versions.map(renderVersionItem)}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-outline-variant">
          <Button variant="outlined" size="sm" onClick={onClose} disabled={actionLoading !== null}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="tonal"
            size="sm"
            onClick={handleDownloadLocal}
            disabled={!selectedVersion || actionLoading !== null}
            loading={actionLoading === "local"}
          >
            <Download size={14} />
            {t("mod.downloadToLocal")}
          </Button>
          <Button
            size="sm"
            onClick={handleInstall}
            disabled={!selectedVersion || !targetVersion || actionLoading !== null}
            loading={actionLoading === "install"}
          >
            <Package size={14} />
            {targetVersion ? t("mod.installToCurrent") : t("home.selectVersion")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
