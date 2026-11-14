import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Download,
  Trash2,
  RefreshCw,
  Search,
  Sparkles,
  ExternalLink,
  Puzzle,
  ChevronRight,
} from "lucide-react";
import { VersionIcon } from "@/components/game/VersionIcon";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/EmptyState";
import { useTranslation } from "@/i18n";
import { useVersionStore } from "@/stores/versionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToast } from "@/components/ui/Toast";
import { versionService } from "@/services/versionService";
import { openUrl } from "@/utils/openUrl";
import { formatError } from "@/utils/format";
import type { VersionInfo, VersionType, LoaderType } from "@/types/version";

type CategoryFilter = "all" | "release" | "snapshot" | "old" | "april_fools" | "pending";

type VersionCategory = {
  key: CategoryFilter;
  type: VersionType;
  labelKey: string;
  icon: React.ReactNode;
};

const TYPE_VARIANT: Record<VersionType, "success" | "warning" | "default" | "info"> = {
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

interface VersionRowProps {
  version: VersionInfo;
  isInstalled: boolean;
  downloadingId: string | null;
  onNavigate: (version: VersionInfo) => void;
  onOpenWiki: (versionId: string) => void;
  onInstallLoader: (versionId: string) => void;
  onDelete: (versionId: string) => void;
  onDownload: (versionId: string) => void;
}

const VersionRow = memo(function VersionRow({
  version,
  isInstalled,
  downloadingId,
  onNavigate,
  onOpenWiki,
  onInstallLoader,
  onDelete,
  onDownload,
}: VersionRowProps) {
  const { t, language } = useTranslation();

  const formatDate = (dateStr: string | number | null | undefined): string => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString(language);
    } catch {
      return String(dateStr);
    }
  };

  return (
    <div
      onClick={isInstalled ? () => onNavigate(version) : undefined}
      className={`flex items-center justify-between gap-3 px-4 py-2.5 border-b border-outline-variant last:border-b-0
        hover:bg-surface-hover/50 transition-colors group ${isInstalled ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-8 h-8 rounded-[7px] flex items-center justify-center flex-shrink-0 transition-transform duration-150 group-hover:scale-105 ${
            isInstalled ? "bg-primary/10" : "bg-surface-container"
          }`}
        >
          <VersionIcon version={version} size={18} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-medium text-on-surface truncate">{version.id}</span>
            <Badge variant={TYPE_VARIANT[version.version_type]}>
              {t(`version.${version.version_type.toLowerCase()}`)}
            </Badge>
            {version.loader && (
              <Badge className="gap-1">
                <VersionIcon loader={version.loader} size={11} />
                {t(`version.${version.loader.toLowerCase()}`)}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-on-surface-subtle mt-0.5 truncate">
            {version.release_time && formatDate(version.release_time)}
            {isInstalled && version.install_time && (
              <span className="ml-2">
                {t("version.installedAt")} {formatDate(version.install_time)}
              </span>
            )}
            {version.lore && <span className="ml-2 text-primary/80">{t(version.lore)}</span>}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {!isInstalled && (
          <Button
            variant="text"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onOpenWiki(version.id);
            }}
            title={t("version.openWiki")}
          >
            <ExternalLink size={15} />
          </Button>
        )}
        {isInstalled && !version.loader && (
          <Button
            variant="text"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onInstallLoader(version.id);
            }}
            title={t("version.installLoader")}
          >
            <Puzzle size={15} />
          </Button>
        )}
        {isInstalled ? (
          <>
            <Button
              variant="text"
              size="sm"
              className="text-danger hover:bg-danger-container hover:text-danger"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(version.id);
              }}
              title={t("common.delete")}
            >
              <Trash2 size={15} />
            </Button>
            <ChevronRight size={15} className="text-on-surface-subtle" />
          </>
        ) : (
          <Button
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onDownload(version.id);
            }}
            loading={downloadingId === version.id}
            disabled={downloadingId !== null && downloadingId !== version.id}
          >
            <Download size={13} />
            {t("version.download")}
          </Button>
        )}
      </div>
    </div>
  );
});

export default function Versions() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const {
    installedVersions,
    remoteVersions,
    loading,
    setInstalledVersions,
    setRemoteVersions,
    setLoading,
    removeInstalledVersion,
  } = useVersionStore();
  const { settings } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<"installed" | "available">("installed");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("release");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [installingLoaderId, setInstallingLoaderId] = useState<string | null>(null);
  const [loaderModalVersion, setLoaderModalVersion] = useState<string | null>(null);
  const [installVersion, setInstallVersion] = useState<string | null>(null);
  const [installLoader, setInstallLoader] = useState<LoaderType | "none">("none");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loaderOptions = useMemo(
    () => [
      { value: "Fabric" as LoaderType, label: t("version.fabric"), desc: t("version.fabricDesc") },
      { value: "Forge" as LoaderType, label: t("version.forge"), desc: t("version.forgeDesc") },
      { value: "NeoForge" as LoaderType, label: t("version.neoforge"), desc: t("version.neoforgeDesc") },
      { value: "Quilt" as LoaderType, label: t("version.quilt"), desc: t("version.quiltDesc") },
    ],
    [t]
  );

  const categories = useMemo<VersionCategory[]>(
    () => [
      { key: "release", type: "Release", labelKey: "version.release", icon: <VersionIcon versionType="Release" size={15} /> },
      { key: "snapshot", type: "Snapshot", labelKey: "version.snapshot", icon: <VersionIcon versionType="Snapshot" size={15} /> },
      { key: "april_fools", type: "AprilFools", labelKey: "version.aprilFools", icon: <VersionIcon versionType="AprilFools" size={15} /> },
      { key: "old", type: "OldBeta", labelKey: "version.oldBeta", icon: <VersionIcon versionType="OldBeta" size={15} /> },
      { key: "pending", type: "Pending", labelKey: "version.pending", icon: <VersionIcon versionType="Pending" size={15} /> },
    ],
    []
  );

  const loadInstalled = useCallback(async () => {
    try {
      const versions = await versionService.getInstalledVersions();
      setInstalledVersions(versions);
    } catch (error) {
      showToast("error", formatError(error));
    }
  }, [setInstalledVersions, showToast]);

  const loadRemote = useCallback(async () => {
    setLoading(true);
    try {
      const versions = await versionService.getManifest(settings.download_source);
      setRemoteVersions(versions);
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setLoading(false);
    }
  }, [setLoading, setRemoteVersions, settings.download_source, showToast]);

  useEffect(() => {
    loadInstalled();
  }, [loadInstalled]);

  useEffect(() => {
    if (activeTab === "available" && remoteVersions.length === 0) {
      loadRemote();
    }
  }, [activeTab, remoteVersions.length, loadRemote]);

  const handleDownload = useCallback(
    async (versionId: string) => {
      setInstallVersion(versionId);
      setInstallLoader("none");
    },
    []
  );

  const handleStartInstall = useCallback(async () => {
    if (!installVersion) return;
    const versionId = installVersion;
    setDownloadingId(versionId);
    try {
      const downloaded = await versionService.downloadVersion(versionId, settings.download_source);
      if (!downloaded) return;
      showToast("success", t("version.downloadSuccess", { version: versionId }));
      if (installLoader !== "none") {
        setInstallingLoaderId(versionId);
        await versionService.installLoader(versionId, installLoader);
        showToast("success", t("version.installLoaderSuccess", { loader: installLoader, version: versionId }));
      }
      await loadInstalled();
      setInstallVersion(null);
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setDownloadingId(null);
      setInstallingLoaderId(null);
    }
  }, [installVersion, installLoader, settings.download_source, showToast, t, loadInstalled]);

  const handleDelete = useCallback(
    async (versionId: string) => {
      try {
        await versionService.deleteVersion(versionId);
        removeInstalledVersion(versionId);
        showToast("success", t("version.deleteSuccess", { version: versionId }));
      } catch (error) {
        showToast("error", formatError(error));
      }
    },
    [removeInstalledVersion, showToast, t]
  );

  const handleInstallLoader = useCallback(
    async (versionId: string, loader: LoaderType) => {
      const target = installedVersions.find((v) => v.id === versionId);
      if (target?.loader === loader) {
        showToast("info", t("version.loaderAlreadyInstalled", { loader }));
        return;
      }
      setInstallingLoaderId(versionId);
      try {
        await versionService.installLoader(versionId, loader);
        showToast("success", t("version.installLoaderSuccess", { loader, version: versionId }));
        await loadInstalled();
      } catch (error) {
        showToast("error", formatError(error));
      } finally {
        setInstallingLoaderId(null);
      }
    },
    [installedVersions, showToast, t, loadInstalled]
  );

  const handleOpenWiki = useCallback(
    (versionId: string) => {
      const wikiName = versionId.replace(/\s+/g, "_").replace(/_unobfuscated$/i, "");
      const url = `https://minecraft.wiki/w/${encodeURIComponent(wikiName)}`;
      openUrl(url).catch(() => {
        showToast("error", t("errors.system.openUrlFailed", { detail: url }));
      });
    },
    [showToast, t]
  );

  const handleNavigate = useCallback(
    (version: VersionInfo) => {
      navigate(`/versions/${version.id}`, { state: { version } });
    },
    [navigate]
  );

  const handleInstallLoaderClick = useCallback((versionId: string) => {
    setLoaderModalVersion(versionId);
  }, []);

  const filterByCategory = useCallback(
    (versions: VersionInfo[], filter: CategoryFilter) => {
      if (filter === "all") return versions;
      if (filter === "old") {
        return versions.filter((v) => v.version_type === "OldBeta" || v.version_type === "OldAlpha");
      }
      if (filter === "snapshot") {
        return versions.filter(
          (v) =>
            v.version_type === "Snapshot" ||
            v.version_type === "Pending" ||
            v.version_type === "PreRelease" ||
            v.version_type === "ReleaseCandidate" ||
            v.version_type === "Unobfuscated"
        );
      }
      const targetType = categories.find((c) => c.key === filter)?.type;
      if (!targetType) return versions;
      return versions.filter((v) => v.version_type === targetType);
    },
    [categories]
  );

  const filterBySearch = useCallback((versions: VersionInfo[], query: string) => {
    if (!query.trim()) return versions;
    const trimmed = query.trim();
    if (trimmed.toLowerCase().startsWith("regex:")) {
      try {
        const pattern = new RegExp(trimmed.slice(6).trim(), "i");
        return versions.filter((v) => pattern.test(v.id));
      } catch {
        return versions.filter((v) => v.id.toLowerCase().includes(trimmed.toLowerCase()));
      }
    }
    const lower = query.toLowerCase();
    return versions.filter((v) => v.id.toLowerCase().includes(lower));
  }, []);

  const filteredInstalled = useMemo(() => {
    return filterBySearch(filterByCategory(installedVersions, categoryFilter), searchQuery);
  }, [installedVersions, categoryFilter, searchQuery, filterByCategory, filterBySearch]);

  const filteredRemote = useMemo(() => {
    return filterBySearch(filterByCategory(remoteVersions, categoryFilter), searchQuery);
  }, [remoteVersions, categoryFilter, searchQuery, filterByCategory, filterBySearch]);

  const groupedRemote = useMemo(() => {
    const sorted = [...filteredRemote].sort(
      (a, b) => new Date(b.release_time).getTime() - new Date(a.release_time).getTime()
    );
    const groups: { category: VersionCategory; versions: VersionInfo[] }[] = [];
    for (const category of categories) {
      let versions: VersionInfo[];
      if (category.key === "old") {
        versions = sorted.filter((v) => v.version_type === "OldBeta" || v.version_type === "OldAlpha");
      } else if (category.key === "snapshot") {
        versions = sorted.filter(
          (v) =>
            v.version_type === "Snapshot" ||
            v.version_type === "Pending" ||
            v.version_type === "PreRelease" ||
            v.version_type === "ReleaseCandidate" ||
            v.version_type === "Unobfuscated"
        );
      } else {
        versions = sorted.filter((v) => v.version_type === category.type);
      }
      if (versions.length > 0) groups.push({ category, versions });
    }
    return groups;
  }, [filteredRemote, categories]);

  const latestRelease = useMemo(() => {
    return remoteVersions
      .filter((v) => v.version_type === "Release")
      .sort((a, b) => new Date(b.release_time).getTime() - new Date(a.release_time).getTime())[0];
  }, [remoteVersions]);

  const latestSnapshot = useMemo(() => {
    return remoteVersions
      .filter(
        (v) =>
          v.version_type === "Snapshot" ||
          v.version_type === "Pending" ||
          v.version_type === "PreRelease" ||
          v.version_type === "ReleaseCandidate" ||
          v.version_type === "Unobfuscated"
      )
      .sort((a, b) => new Date(b.release_time).getTime() - new Date(a.release_time).getTime())[0];
  }, [remoteVersions]);

  const categoryOptions = useMemo(
    () => [
      { value: "all", label: t("version.allVersions") },
      { value: "release", label: t("version.release") },
      { value: "snapshot", label: t("version.snapshot") },
      { value: "old", label: t("version.oldVersions") },
      { value: "april_fools", label: t("version.aprilFools") },
      { value: "pending", label: t("version.pending") },
    ],
    [t]
  );

  const tabButtonClass = (tab: "installed" | "available") =>
    `segmented-item ${activeTab === tab ? "segmented-item-active" : "segmented-item-idle"}`;

  return (
    <PageTransition>
      <div className="p-5 h-full flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-3 shrink-0 pb-3 border-b border-outline-variant">
          <div className="min-w-0">
            <h1 className="wallpaper-text text-[18px] font-semibold tracking-tight truncate">{t("version.title")}</h1>
          </div>
          <div className="segmented shrink-0">
            <button className={tabButtonClass("installed")} onClick={() => setActiveTab("installed")}>
              {t("version.installed")}
            </button>
            <button className={tabButtonClass("available")} onClick={() => setActiveTab("available")}>
              {t("version.notInstalled")}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="relative w-[260px] shrink-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-subtle" />
            <Input
              placeholder={t("common.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="[&>input]:pl-8"
            />
          </div>
          <Select
            options={categoryOptions}
            value={categoryFilter}
            onChange={(v) => setCategoryFilter(v as CategoryFilter)}
            className="w-[150px] shrink-0"
          />
          {activeTab === "available" && (
            <Button variant="tonal" onClick={loadRemote} loading={loading} className="shrink-0 ml-auto">
              <RefreshCw size={14} />
              {t("version.refresh")}
            </Button>
          )}
        </div>

        {activeTab === "installed" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {installedVersions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <EmptyState
                  title={t("home.noVersion")}
                  description={t("version.downloadPrompt")}
                  action={
                    <Button onClick={() => setActiveTab("available")}>{t("version.download")}</Button>
                  }
                />
              </div>
            ) : filteredInstalled.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <EmptyState title={t("version.noAvailable")} description={t("version.noMatchingVersions")} />
              </div>
            ) : (
              <div className="panel-fill flex flex-col flex-1 overflow-hidden">
                <div className="panel-header shrink-0">
                  <span className="w-5 h-5 rounded-[4px] bg-primary/10 flex items-center justify-center">
                    <VersionIcon versionType="Release" size={14} />
                  </span>
                  <span className="text-[12px] font-semibold text-on-surface flex-1">
                    {t("version.installed")}
                  </span>
                  <Badge variant="info">{filteredInstalled.length}</Badge>
                </div>
                <div className="overflow-y-auto flex-1">
                {filteredInstalled.map((version) => (
                  <VersionRow
                    key={version.id}
                    version={version}
                    isInstalled
                    downloadingId={downloadingId}
                    onNavigate={handleNavigate}
                    onOpenWiki={handleOpenWiki}
                    onInstallLoader={handleInstallLoaderClick}
                    onDelete={setDeleteTarget}
                    onDownload={handleDownload}
                  />
                ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "available" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {loading && remoteVersions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-[13px] text-on-surface-variant animate-pulse">
                {t("common.loading")}
              </div>
            ) : remoteVersions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <EmptyState
                  title={t("version.noAvailable")}
                  description={t("version.loadFailed")}
                  action={
                    <Button onClick={loadRemote}>
                      <RefreshCw size={15} />
                      {t("common.retry")}
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto flex-1 pr-0.5">
                {(latestRelease || latestSnapshot) && categoryFilter === "all" && !searchQuery && (
                  <section className="relative overflow-hidden rounded-card border border-outline-variant bg-surface-high shadow-card">
                    <div className="relative flex items-center gap-2 px-4 h-10 border-b border-outline-variant">
                      <span className="w-5 h-5 rounded-[4px] bg-primary/10 text-primary flex items-center justify-center">
                        <Sparkles size={12} />
                      </span>
                      <span className="text-[12px] font-semibold text-on-surface">
                        {t("version.latestVersions")}
                      </span>
                    </div>
                    <div className="relative divide-y divide-outline-variant">
                      {latestRelease && (
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-[11px] text-on-surface-variant">{t("version.release")}</p>
                            <p className="text-[14px] font-semibold text-on-surface">{latestRelease.id}</p>
                            <p className="text-[11px] text-on-surface-subtle">
                              {new Date(latestRelease.release_time).toLocaleDateString()}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleDownload(latestRelease.id)}
                            disabled={downloadingId !== null}
                          >
                            <Download size={13} />
                            {t("version.download")}
                          </Button>
                        </div>
                      )}
                      {latestSnapshot && (
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-[11px] text-on-surface-variant">{t("version.snapshot")}</p>
                            <p className="text-[14px] font-semibold text-on-surface">{latestSnapshot.id}</p>
                            <p className="text-[11px] text-on-surface-subtle">
                              {new Date(latestSnapshot.release_time).toLocaleDateString()}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleDownload(latestSnapshot.id)}
                            disabled={downloadingId !== null}
                          >
                            <Download size={13} />
                            {t("version.download")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {groupedRemote.length === 0 ? (
                  <EmptyState title={t("version.noAvailable")} description={t("version.noMatchingVersions")} />
                ) : (
                  groupedRemote.map(({ category, versions }) => (
                    <section
                      key={category.key}
                      className="rounded-card border border-outline-variant bg-surface-high overflow-hidden shadow-card"
                    >
                      <div className="flex items-center gap-2 px-4 h-10 border-b border-outline-variant">
                        <span className="w-5 h-5 rounded-[4px] bg-surface-container text-on-surface-variant flex items-center justify-center">
                          {category.icon}
                        </span>
                        <h3 className="text-[12px] font-semibold text-on-surface flex-1">{t(category.labelKey)}</h3>
                        <Badge variant="default">{String(versions.length)}</Badge>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {versions.map((version) => (
                          <VersionRow
                            key={version.id}
                            version={version}
                            isInstalled={false}
                            downloadingId={downloadingId}
                            onNavigate={handleNavigate}
                            onOpenWiki={handleOpenWiki}
                            onInstallLoader={handleInstallLoaderClick}
                            onDelete={setDeleteTarget}
                            onDownload={handleDownload}
                          />
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* 新版本安装：先选加载器再下载 */}
        <Modal
          open={installVersion !== null}
          onClose={() => setInstallVersion(null)}
          title={t("version.installWithLoader")}
        >
          <div className="space-y-3.5">
            <p className="text-[12px] text-on-surface-variant">
              {t("version.installWithLoaderHint")}
            </p>
            <div className="flex items-center gap-2 text-[13px] text-on-surface">
              <VersionIcon versionType="Release" size={16} />
              <span className="font-medium">{installVersion}</span>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setInstallLoader("none")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-btn border text-left transition-colors duration-150 ${
                  installLoader === "none"
                    ? "border-primary bg-primary/8"
                    : "border-outline-variant bg-surface-container hover:bg-surface-hover"
                }`}
              >
                <div className="w-7 h-7 rounded-[4px] bg-primary/10 flex items-center justify-center">
                  <VersionIcon versionType="Release" size={16} />
                </div>
                <span className="text-[13px] text-on-surface">{t("version.loaderNone")}</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                {loaderOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setInstallLoader(option.value)}
                    className={`flex items-start gap-2.5 p-3 rounded-btn border text-left transition-colors duration-150 ${
                      installLoader === option.value
                        ? "border-primary bg-primary/8"
                        : "border-outline-variant bg-surface-container hover:bg-surface-hover"
                    }`}
                  >
                    <div className="w-7 h-7 rounded-[4px] bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <VersionIcon loader={option.value} size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium text-on-surface">{option.label}</p>
                      <p className="text-[10.5px] text-on-surface-subtle mt-0.5 line-clamp-2">
                        {option.desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="text"
                onClick={() => setInstallVersion(null)}
                disabled={downloadingId !== null}
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleStartInstall}
                loading={downloadingId !== null || installingLoaderId !== null}
                disabled={downloadingId !== null || installingLoaderId !== null}
              >
                {installingLoaderId
                  ? t("version.installing")
                  : downloadingId
                  ? t("version.downloading", { version: installVersion || "" })
                  : t("version.startInstall")}
              </Button>
            </div>
          </div>
        </Modal>

        {/* 已安装版本追加加载器 */}
        <Modal
          open={!!loaderModalVersion}
          onClose={() => setLoaderModalVersion(null)}
          title={t("version.selectLoader")}
        >
          <div className="space-y-3">
            <p className="text-[12px] text-on-surface-variant">
              {t("version.installLoaderHint", { version: loaderModalVersion || "" })}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {loaderOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={installingLoaderId === loaderModalVersion}
                  onClick={() => {
                    if (loaderModalVersion) {
                      handleInstallLoader(loaderModalVersion, option.value);
                      setLoaderModalVersion(null);
                    }
                  }}
                  className="flex items-start gap-2.5 p-3 rounded-btn border border-outline-variant bg-surface-container
                    hover:border-primary hover:bg-surface-hover transition-colors text-left
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-8 h-8 rounded-btn bg-surface-hover border border-outline-variant flex items-center justify-center flex-shrink-0">
                    <VersionIcon loader={option.value} size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-on-surface">{option.label}</p>
                    <p className="text-[10.5px] text-on-surface-subtle mt-0.5 line-clamp-2">
                      {option.desc}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Modal>

        <ConfirmDialog
          open={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
          title={t("version.deleteVersion")}
          message={t("version.deleteConfirm", { version: deleteTarget || "" })}
          confirmText={t("common.delete")}
          danger
        />
      </div>
    </PageTransition>
  );
}
