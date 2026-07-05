import { useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, Box, Clock, History, Sparkles, AlertCircle, FileCode, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageTransition } from "@/components/common/PageTransition";
import { useTranslation } from "@/i18n";
import { useVersionStore } from "@/stores/versionStore";
import { useToast } from "@/components/ui/Toast";
import { versionService } from "@/services/versionService";
import { formatError } from "@/utils/format";
import type { VersionInfo, VersionType, LoaderType } from "@/types/version";

const TYPE_ICON: Record<VersionType, React.ReactNode> = {
  Release: <Box size={18} />,
  Snapshot: <Clock size={18} />,
  PreRelease: <FileCode size={18} />,
  ReleaseCandidate: <FileCode size={18} />,
  OldBeta: <History size={18} />,
  OldAlpha: <History size={18} />,
  Pending: <AlertCircle size={18} />,
  AprilFools: <Sparkles size={18} />,
  Unobfuscated: <FileCode size={18} />,
};

const TYPE_VARIANT: Record<VersionType, "success" | "warning" | "default" | "danger" | "info" | "purple"> = {
  Release: "success",
  Snapshot: "warning",
  PreRelease: "info",
  ReleaseCandidate: "info",
  OldBeta: "default",
  OldAlpha: "default",
  Pending: "info",
  AprilFools: "purple",
  Unobfuscated: "default",
};

const LOADERS: LoaderType[] = ["Forge", "Fabric", "NeoForge", "Quilt"];

function formatDate(value: string | number | null | undefined): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return String(value);
  }
}

export default function VersionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { installedVersions, setInstalledVersions } = useVersionStore();
  const [installingLoader, setInstallingLoader] = useState<string | null>(null);
  const [togglingIsolation, setTogglingIsolation] = useState(false);
  const [selectingGameDir, setSelectingGameDir] = useState(false);

  const version: VersionInfo | undefined =
    (location.state as { version?: VersionInfo } | undefined)?.version ||
    installedVersions.find((v) => v.id === id);

  const refreshVersions = async () => {
    const versions = await versionService.getInstalledVersions();
    setInstalledVersions(versions);
  };

  const handleInstallLoader = async (loader: string) => {
    if (!id) return;
    if (version?.loader?.toLowerCase() === loader.toLowerCase()) {
      showToast("info", t("version.loaderAlreadyInstalled", { loader }));
      return;
    }
    setInstallingLoader(loader);
    try {
      await versionService.installLoader(id, loader);
      showToast("success", t("version.installLoaderSuccess", { loader, version: id }));
      await refreshVersions();
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setInstallingLoader(null);
    }
  };

  const handleToggleIsolation = async () => {
    if (!id) return;
    setTogglingIsolation(true);
    try {
      await versionService.toggleVersionIsolation(id);
      showToast(
        "success",
        t(version?.is_isolated ? "version.isolationDisabled" : "version.isolationEnabled"),
      );
      await refreshVersions();
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setTogglingIsolation(false);
    }
  };

  const handleSelectGameDir = async () => {
    if (!id) return;
    setSelectingGameDir(true);
    try {
      const path = await versionService.selectVersionGameDir(id);
      if (path) {
        showToast("success", t("version.gameDirSet"));
        await refreshVersions();
      }
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setSelectingGameDir(false);
    }
  };

  const handleClearGameDir = async () => {
    if (!id) return;
    try {
      await versionService.clearVersionGameDir(id);
      showToast("success", t("version.gameDirCleared"));
      await refreshVersions();
    } catch (error) {
      showToast("error", formatError(error));
    }
  };

  return (
    <PageTransition>
      <div className="p-6 space-y-4 h-full flex flex-col">
        <Button variant="text" size="sm" onClick={() => navigate("/versions")} className="w-fit">
          <ChevronLeft size={16} />
          {t("common.back")}
        </Button>

        <div>
          <h1 className="text-2xl font-bold text-on-surface">{id}</h1>
          {version && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant={TYPE_VARIANT[version.version_type]}>
                <span className="flex items-center gap-1">
                  {TYPE_ICON[version.version_type]}
                  {t(`version.${version.version_type.toLowerCase()}`)}
                </span>
              </Badge>
              {version.loader ? (
                <Badge>{t(`version.${version.loader.toLowerCase()}`)}</Badge>
              ) : (
                <Badge variant="default">{t("version.noLoader")}</Badge>
              )}
            </div>
          )}
        </div>

        {!version ? (
          <Card>
            <div className="flex items-center gap-3 text-on-surface-variant">
              <FolderOpen size={20} />
              <p className="text-sm">{t("version.notFound", { detail: id || "" })}</p>
            </div>
          </Card>
        ) : (
          <>
            <Card>
              <h3 className="text-sm font-semibold text-on-surface mb-4">{t("version.basicInfo")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-on-surface-variant mb-0.5">{t("version.release")}</p>
                  <p className="text-on-surface font-medium">{t(`version.${version.version_type.toLowerCase()}`)}</p>
                </div>
                <div>
                  <p className="text-on-surface-variant mb-0.5">{t("version.gameDir")}</p>
                  <p className="text-on-surface font-medium truncate">{version.game_dir || t("version.selectGameDir")}</p>
                </div>
                <div>
                  <p className="text-on-surface-variant mb-0.5">{t("version.installedAt")}</p>
                  <p className="text-on-surface font-medium">
                    {version.install_time ? formatDate(version.install_time) : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-on-surface-variant mb-0.5">{t("version.versionIsolation")}</p>
                  <p className="text-on-surface font-medium">
                    {version.is_isolated ? t("version.isolationEnabled") : t("version.isolationDisabled")}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-on-surface mb-3">{t("version.installLoader")}</h3>
              <div className="grid grid-cols-2 gap-2">
                {LOADERS.map((loader) => (
                  <Button
                    key={loader}
                    variant="tonal"
                    size="sm"
                    onClick={() => handleInstallLoader(loader)}
                    loading={installingLoader === loader}
                    disabled={installingLoader !== null}
                  >
                    {t(`version.${loader.toLowerCase()}`)}
                  </Button>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-on-surface mb-3">{t("version.versionIsolation")}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-on-surface-variant">{t("version.versionIsolation")}</span>
                  <Badge variant={version.is_isolated ? "success" : "default"}>
                    {version.is_isolated ? t("version.isolationEnabled") : t("version.isolationDisabled")}
                  </Badge>
                </div>
                <div className="text-sm">
                  <p className="text-on-surface-variant mb-0.5">{t("version.gameDir")}</p>
                  <p className="text-on-surface font-medium break-all">{version.game_dir || t("version.selectGameDir")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="tonal"
                    size="sm"
                    onClick={handleToggleIsolation}
                    loading={togglingIsolation}
                    disabled={togglingIsolation || selectingGameDir}
                  >
                    {version.is_isolated ? t("version.disableIsolation") : t("version.enableIsolation")}
                  </Button>
                  <Button
                    variant="outlined"
                    size="sm"
                    onClick={handleSelectGameDir}
                    loading={selectingGameDir}
                    disabled={togglingIsolation || selectingGameDir}
                  >
                    {t("version.selectGameDir")}
                  </Button>
                  {version.game_dir && (
                    <Button
                      variant="outlined"
                      size="sm"
                      onClick={handleClearGameDir}
                      disabled={togglingIsolation || selectingGameDir}
                    >
                      {t("version.useDefaultGameDir")}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </PageTransition>
  );
}
