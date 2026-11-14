import { useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, FolderOpen, Download, Coffee, Wrench, AlertCircle } from "lucide-react";
import { VersionIcon } from "@/components/game/VersionIcon";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { PageTransition } from "@/components/common/PageTransition";
import { useTranslation } from "@/i18n";
import { useVersionStore } from "@/stores/versionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToast } from "@/components/ui/Toast";
import { versionService } from "@/services/versionService";
import { formatError } from "@/utils/format";
import type { VersionInfo, VersionType, LoaderType, ExportOption, LoaderVersionInfo } from "@/types/version";

const TYPE_VARIANT: Record<VersionType, "success" | "warning" | "default" | "danger" | "info"> = {
  Release: "info",
  Snapshot: "warning",
  PreRelease: "info",
  ReleaseCandidate: "info",
  OldBeta: "default",
  OldAlpha: "default",
  Pending: "info",
  AprilFools: "warning",
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
  const { settings } = useSettingsStore();
  const [installingLoader, setInstallingLoader] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [loaderVersionModalOpen, setLoaderVersionModalOpen] = useState(false);
  const [selectedLoader, setSelectedLoader] = useState<LoaderType | null>(null);
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersionInfo[]>([]);
  const [loaderVersionsLoading, setLoaderVersionsLoading] = useState(false);
  const [selectedLoaderVersion, setSelectedLoaderVersion] = useState<string>("");
  const [togglingIsolation, setTogglingIsolation] = useState(false);
  const [isolationOverride, setIsolationOverride] = useState<boolean | null>(null);
  const [selectingGameDir, setSelectingGameDir] = useState(false);
  const [selectingJava, setSelectingJava] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOptions, setExportOptions] = useState<ExportOption[]>([
    { key: "manifest", label: t("version.exportManifest"), checked: true },
    { key: "versionJson", label: t("version.exportVersionJson"), checked: true },
    // 资源与依赖库在导入时会自动下载，默认不打包，避免整合包体积过大
    { key: "assets", label: t("version.exportAssets"), checked: false },
    { key: "libraries", label: t("version.exportLibraries"), checked: false },
    { key: "mods", label: t("version.exportMods"), checked: true },
    { key: "saves", label: t("version.exportSaves"), checked: false },
    { key: "options", label: t("version.exportOptions"), checked: false },
    { key: "resourcepacks", label: t("version.exportResourcepacks"), checked: false },
    { key: "shaderpacks", label: t("version.exportShaderpacks"), checked: false },
    { key: "config", label: t("version.exportConfig"), checked: false },
  ]);

  const selectedExportOptions = useMemo(() => exportOptions.filter((option) => option.checked), [exportOptions]);

  const version: VersionInfo | undefined =
    installedVersions.find((v) => v.id === id) ||
    (location.state as { version?: VersionInfo } | undefined)?.version;

  // 隔离开关的即时状态：点击后立刻反映，写入成功后再以真实数据为准
  const isIsolated = isolationOverride ?? Boolean(version?.is_isolated);

  const refreshVersions = async () => {
    const versions = await versionService.getInstalledVersions();
    setInstalledVersions(versions);
  };

  const handleOpenDir = async () => {
    if (!id) return;
    try {
      await versionService.openVersionDir(id);
    } catch (error) {
      showToast("error", formatError(error));
    }
  };

  const handleRepair = async () => {
    if (!id) return;
    setRepairing(true);
    try {
      const downloaded = await versionService.downloadVersion(id, settings.download_source);
      if (!downloaded) return;
      await refreshVersions();
      showToast("success", t("version.repairSuccess"));
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setRepairing(false);
    }
  };

  const handleOpenLoaderVersionModal = async (loader: LoaderType) => {
    if (!id) return;
    setSelectedLoader(loader);
    setLoaderVersionModalOpen(true);
    setLoaderVersionsLoading(true);
    setSelectedLoaderVersion("");
    setLoaderVersions([]);
    try {
      const versions = await versionService.getLoaderVersions(id, loader);
      setLoaderVersions(versions);
      const defaultVersion = versions.find((v) => v.is_recommended || v.is_latest) || versions[0];
      if (defaultVersion) {
        setSelectedLoaderVersion(defaultVersion.version);
      }
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setLoaderVersionsLoading(false);
    }
  };

  const handleInstallLoader = async () => {
    if (!id || !selectedLoader || !selectedLoaderVersion) return;
    setInstallingLoader(selectedLoader);
    try {
      await versionService.installLoader(id, selectedLoader, selectedLoaderVersion);
      showToast("success", t("version.installLoaderSuccess", { loader: selectedLoader, version: id }));
      setLoaderVersionModalOpen(false);
      await refreshVersions();
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setInstallingLoader(null);
    }
  };

  const handleToggleIsolation = async () => {
    if (!id || !version) return;
    const next = !isIsolated;
    setIsolationOverride(next);
    setTogglingIsolation(true);
    try {
      await versionService.toggleVersionIsolation(id);
      showToast(
        "success",
        t(next ? "version.isolationEnabled" : "version.isolationDisabled"),
      );
      await refreshVersions();
      setIsolationOverride(null);
    } catch (error) {
      // 写入失败时回滚显示，避免界面与真实状态不一致
      setIsolationOverride(!next);
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

  const handleSelectJava = async () => {
    if (!id) return;
    setSelectingJava(true);
    try {
      const path = await versionService.selectVersionJava(id);
      if (path) {
        showToast("success", t("version.javaSet"));
        await refreshVersions();
      }
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setSelectingJava(false);
    }
  };

  const handleClearJava = async () => {
    if (!id) return;
    try {
      await versionService.clearVersionJava(id);
      showToast("success", t("version.javaCleared"));
      await refreshVersions();
    } catch (error) {
      showToast("error", formatError(error));
    }
  };

  const handleToggleExportOption = (key: ExportOption["key"]) => {
    setExportOptions((current) =>
      current.map((option) => (option.key === key ? { ...option, checked: !option.checked } : option)),
    );
  };

  const handleSelectAllExportOptions = (checked: boolean) => {
    setExportOptions((current) => current.map((option) => ({ ...option, checked })));
  };

  const handleExportPack = async () => {
    if (!id || selectedExportOptions.length === 0) return;
    setExporting(true);
    try {
      const path = await versionService.exportVersionPack(id, selectedExportOptions);
      if (path) {
        showToast("success", t("version.exportSuccess"));
        setExportModalOpen(false);
      }
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageTransition variant="slide">
      <div className="p-5 space-y-3.5 h-full flex flex-col overflow-y-auto">
        <Button variant="text" size="sm" onClick={() => navigate("/versions")} className="w-fit">
          <ChevronLeft size={16} />
          {t("common.back")}
        </Button>

        <div className="pb-3 border-b border-outline-variant">
          <div className="flex items-center gap-3">
            {version && <VersionIcon version={version} size={32} />}
            <h1 className="wallpaper-text text-[18px] font-semibold tracking-tight truncate">{id}</h1>
          </div>
          {version && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant={TYPE_VARIANT[version.version_type]}>
                <span className="flex items-center gap-1">
                  <VersionIcon version={version} size={14} />
                  {t(`version.${version.version_type.toLowerCase()}`)}
                </span>
              </Badge>
              {version.loader ? (
                <Badge className="gap-1">
                  <VersionIcon loader={version.loader} size={14} />
                  {t(`version.${version.loader.toLowerCase()}`)}
                  {version.loader_history?.[version.loader] && (
                    <span className="text-on-surface-variant ml-1">
                      {version.loader_history[version.loader]}
                    </span>
                  )}
                </Badge>
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
                  <p className="text-on-surface-variant mb-0.5">{t("version.versionType")}</p>
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
                    {isIsolated ? t("version.isolationEnabled") : t("version.isolationDisabled")}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <Button variant="outlined" size="sm" onClick={handleOpenDir}>
                  <FolderOpen size={15} />
                  {t("version.openDir")}
                </Button>
                {!version.loader && (
                  <Button variant="outlined" size="sm" onClick={handleRepair} loading={repairing}>
                    <Wrench size={15} />
                    {t("version.repairFiles")}
                  </Button>
                )}
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
                    onClick={() => handleOpenLoaderVersionModal(loader)}
                    loading={installingLoader === loader}
                    disabled={installingLoader !== null}
                  >
                    <VersionIcon loader={loader} size={16} />
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
                  <Badge variant={isIsolated ? "info" : "default"}>
                    {isIsolated ? t("version.isolationEnabled") : t("version.isolationDisabled")}
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
                    {isIsolated ? t("version.disableIsolation") : t("version.enableIsolation")}
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
            <Card>
              <h3 className="text-sm font-semibold text-on-surface mb-3">{t("version.versionJava")}</h3>
              <div className="space-y-3">
                <div className="text-sm">
                  <p className="text-on-surface-variant mb-0.5">{t("version.javaPath")}</p>
                  <p className="text-on-surface font-medium break-all">
                    {version.java_path || t("version.useGlobalJava")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="tonal"
                    size="sm"
                    onClick={handleSelectJava}
                    loading={selectingJava}
                    disabled={selectingJava}
                  >
                    <Coffee size={16} />
                    {t("version.selectJava")}
                  </Button>
                  {version.java_path && (
                    <Button
                      variant="outlined"
                      size="sm"
                      onClick={handleClearJava}
                      disabled={selectingJava}
                    >
                      {t("version.useGlobalJava")}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-on-surface mb-3">{t("version.exportPack")}</h3>
              <div className="space-y-4 text-sm">
                <p className="text-on-surface-variant leading-relaxed">{t("version.exportPackDesc")}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="tonal" size="sm" onClick={() => setExportModalOpen(true)}>
                    <Download size={16} />
                    {t("version.exportPack")}
                  </Button>
                </div>
              </div>
            </Card>
          </>
        )}

        <Modal
          open={loaderVersionModalOpen}
          onClose={() => setLoaderVersionModalOpen(false)}
          title={t("version.selectLoaderVersion")}
          className="max-w-[600px]"
        >
          <div className="space-y-4">
            {selectedLoader && (
              <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                <VersionIcon loader={selectedLoader} size={18} />
                <span>{t("version.installLoaderHint", { version: id || "" })}</span>
              </div>
            )}

            {loaderVersionsLoading ? (
              <div className="flex items-center justify-center py-8 text-sm text-on-surface-variant">
                {t("common.loading")}
              </div>
            ) : loaderVersions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-sm text-on-surface-variant">
                <AlertCircle size={24} className="mb-2" />
                {t("version.noLoaderVersions")}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto">
                {loaderVersions.map((loaderVersion) => (
                  <button
                    key={loaderVersion.version}
                    type="button"
                    onClick={() => setSelectedLoaderVersion(loaderVersion.version)}
                    className={`flex items-center justify-between rounded-card border px-4 py-3 text-left transition-colors ${
                      selectedLoaderVersion === loaderVersion.version
                        ? "border-primary bg-primary/10"
                        : "border-primary/25 hover:bg-surface-container"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-on-surface">{loaderVersion.version}</span>
                      <div className="flex items-center gap-1">
                        {loaderVersion.is_recommended && (
                          <Badge variant="info">{t("version.loaderRecommended")}</Badge>
                        )}
                        {loaderVersion.is_latest && (
                          <Badge variant="info">{t("version.loaderLatest")}</Badge>
                        )}
                      </div>
                    </div>
                    <div
                      className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                        selectedLoaderVersion === loaderVersion.version
                          ? "border-primary bg-primary"
                          : "border-outline"
                      }`}
                    >
                      {selectedLoaderVersion === loaderVersion.version && (
                        <div className="h-2 w-2 rounded-full bg-white" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outlined"
                size="sm"
                onClick={() => setLoaderVersionModalOpen(false)}
                disabled={!!installingLoader}
              >
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={handleInstallLoader}
                loading={!!installingLoader}
                disabled={!selectedLoaderVersion || loaderVersionsLoading || !!installingLoader}
              >
                {installingLoader
                  ? t("version.installingLoader", { loader: installingLoader })
                  : t("version.install")}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          open={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          title={t("version.exportPack")}
          className="max-w-[600px]"
        >
          <div className="space-y-4">
            <p className="text-sm text-on-surface-variant">{t("version.exportPackDesc")}</p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outlined" size="sm" onClick={() => handleSelectAllExportOptions(true)} disabled={exporting}>
                {t("version.exportSelectAll")}
              </Button>
              <Button variant="outlined" size="sm" onClick={() => handleSelectAllExportOptions(false)} disabled={exporting}>
                {t("version.exportSelectNone")}
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {exportOptions.map((option) => (
                <div
                  key={option.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleToggleExportOption(option.key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleToggleExportOption(option.key);
                    }
                  }}
                  className="flex items-center justify-between gap-3 rounded-card border border-outline-variant px-4 py-3 text-left hover:bg-surface-hover transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-on-surface">{option.label}</p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {option.checked ? t("version.exportWillInclude") : t("version.exportWillExclude")}
                    </p>
                  </div>
                  <span onClick={(event) => event.stopPropagation()}>
                    <Switch checked={option.checked} onChange={() => handleToggleExportOption(option.key)} />
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              <p className="text-xs text-on-surface-variant mr-auto">{t("version.exportSelectedCount", { count: String(selectedExportOptions.length) })}</p>
              <Button variant="outlined" size="sm" onClick={() => setExportModalOpen(false)} disabled={exporting}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" onClick={handleExportPack} loading={exporting} disabled={selectedExportOptions.length === 0}>
                {t("version.exportPack")}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </PageTransition>
  );
}
