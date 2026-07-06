import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Download,
  Trash2,
  FolderOpen,
  RefreshCw,
  Search,
  Box,
  Gamepad2,
  Clock,
  Sparkles,
  History,
  AlertCircle,
  FileCode,
  ExternalLink,
  Puzzle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
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
  color: "success" | "warning" | "default" | "danger" | "info" | "purple";
};

const TYPE_ICON: Record<VersionType, React.ReactNode> = {
  Release: <Box size={20} />,
  Snapshot: <Clock size={20} />,
  PreRelease: <FileCode size={20} />,
  ReleaseCandidate: <FileCode size={20} />,
  OldBeta: <History size={20} />,
  OldAlpha: <History size={20} />,
  Pending: <AlertCircle size={20} />,
  AprilFools: <Sparkles size={20} />,
  Unobfuscated: <FileCode size={20} />,
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

function formatDate(dateStr: string | number | null | undefined): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return String(dateStr);
  }
}

interface VersionItemCardProps {
  version: VersionInfo;
  isInstalled: boolean;
  downloadingId: string | null;
  onNavigate: (version: VersionInfo) => void;
  onOpenWiki: (versionId: string) => void;
  onInstallLoader: (versionId: string) => void;
  onDelete: (versionId: string) => void;
  onDownload: (versionId: string) => void;
}

const VersionItemCard = memo(function VersionItemCard({
  version,
  isInstalled,
  downloadingId,
  onNavigate,
  onOpenWiki,
  onInstallLoader,
  onDelete,
  onDownload,
}: VersionItemCardProps) {
  const { t } = useTranslation();

  return (
    <Card
      hover
      onClick={isInstalled ? () => onNavigate(version) : undefined}
      className="flex items-center justify-between p-3 group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center flex-shrink-0 text-on-surface-variant">
          {isInstalled ? <FolderOpen size={20} /> : TYPE_ICON[version.version_type] ?? <Gamepad2 size={20} />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-on-surface truncate">{version.id}</span>
            <Badge variant={TYPE_VARIANT[version.version_type]}>
              {t(`version.${version.version_type.toLowerCase()}`)}
            </Badge>
            {version.loader && <Badge>{t(`version.${version.loader.toLowerCase()}`)}</Badge>}
          </div>
          {version.release_time && (
            <p className="text-xs text-on-surface-variant mt-0.5">{formatDate(version.release_time)}</p>
          )}
          {version.lore && <p className="text-xs text-primary/80 mt-0.5">{t(version.lore)}</p>}
          {isInstalled && version.install_time && (
            <p className="text-xs text-on-surface-variant mt-0.5">
              {t("version.installedAt")} {formatDate(version.install_time)}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        {!isInstalled && (
          <Button
            variant="text"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onOpenWiki(version.id);
            }}
            title={t("common.search")}
          >
            <ExternalLink size={16} />
          </Button>
        )}
        {isInstalled && !version.loader && (
          <Button
            variant="text"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onInstallLoader(version.id);
            }}
            title={t("version.installLoader")}
          >
            <Puzzle size={16} />
          </Button>
        )}
        {isInstalled ? (
          <Button
            variant="text"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(version.id);
            }}
          >
            <Trash2 size={16} />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDownload(version.id);
            }}
            loading={downloadingId === version.id}
          >
            <Download size={14} className="mr-1" />
            {t("version.download")}
          </Button>
        )}
      </div>
    </Card>
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

  const loaderOptions = useMemo(
    () => [
      {
        value: "Fabric" as LoaderType,
        label: t("version.fabric"),
        desc: t("version.fabricDesc"),
        color: "from-amber-500/10 to-orange-500/5",
        iconColor: "text-amber-500",
      },
      {
        value: "Forge" as LoaderType,
        label: t("version.forge"),
        desc: t("version.forgeDesc"),
        color: "from-red-500/10 to-orange-500/5",
        iconColor: "text-red-500",
      },
      {
        value: "NeoForge" as LoaderType,
        label: t("version.neoforge"),
        desc: t("version.neoforgeDesc"),
        color: "from-orange-500/10 to-amber-500/5",
        iconColor: "text-orange-500",
      },
      {
        value: "Quilt" as LoaderType,
        label: t("version.quilt"),
        desc: t("version.quiltDesc"),
        color: "from-purple-500/10 to-indigo-500/5",
        iconColor: "text-purple-500",
      },
    ],
    [t]
  );

  const categories = useMemo<VersionCategory[]>(
    () => [
      {
        key: "release",
        type: "Release",
        labelKey: "version.release",
        icon: <Box size={18} />,
        color: "success",
      },
      {
        key: "snapshot",
        type: "Snapshot",
        labelKey: "version.snapshot",
        icon: <Clock size={18} />,
        color: "warning",
      },
      {
        key: "april_fools",
        type: "AprilFools",
        labelKey: "version.aprilFools",
        icon: <Sparkles size={18} />,
        color: "purple",
      },
      {
        key: "old",
        type: "OldBeta",
        labelKey: "version.oldBeta",
        icon: <History size={18} />,
        color: "default",
      },
      {
        key: "pending",
        type: "Pending",
        labelKey: "version.pending",
        icon: <AlertCircle size={18} />,
        color: "info",
      },
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
      setDownloadingId(versionId);
      try {
        await versionService.downloadVersion(versionId, settings.download_source);
        showToast("success", t("version.downloadSuccess", { version: versionId }));
        await loadInstalled();
      } catch (error) {
        showToast("error", formatError(error));
      } finally {
        setDownloadingId(null);
      }
    },
    [settings.download_source, showToast, t, loadInstalled]
  );

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
    async (versionId: string, loader: string) => {
      const target = installedVersions.find((v) => v.id === versionId);
      if (target?.loader?.toLowerCase() === loader.toLowerCase()) {
        showToast("info", t("version.loaderAlreadyInstalled", { loader }));
        setLoaderModalVersion(null);
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
    const sorted = [...filteredRemote].sort((a, b) => {
      return new Date(b.release_time).getTime() - new Date(a.release_time).getTime();
    });

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
      if (versions.length > 0) {
        groups.push({ category, versions });
      }
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

  return (
    <PageTransition>
      <div className="p-6 space-y-4 h-full flex flex-col">
        <h1 className="text-2xl font-bold text-on-surface">{t("version.title")}</h1>

        {/* 标签切换 */}
        <div className="flex gap-2">
          <Button variant={activeTab === "installed" ? "filled" : "tonal"} size="sm" onClick={() => setActiveTab("installed")}>
            {t("version.installed")}
          </Button>
          <Button variant={activeTab === "available" ? "filled" : "tonal"} size="sm" onClick={() => setActiveTab("available")}>
            {t("version.notInstalled")}
          </Button>
        </div>

        {/* 搜索与过滤工具栏 */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <Input
              placeholder={t("common.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            options={categoryOptions}
            value={categoryFilter}
            onChange={(v) => setCategoryFilter(v as CategoryFilter)}
            className="w-40"
          />
          {activeTab === "available" && (
            <Button size="sm" variant="tonal" onClick={loadRemote} loading={loading}>
              <RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />
              {t("version.refresh")}
            </Button>
          )}
        </div>

        {/* 已安装版本 */}
        {activeTab === "installed" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {installedVersions.length === 0 ? (
              <EmptyState
                title={t("home.noVersion")}
                description={t("version.downloadPrompt")}
                action={
                  <Button onClick={() => setActiveTab("available")}>{t("version.download")}</Button>
                }
              />
            ) : filteredInstalled.length === 0 ? (
              <EmptyState title={t("version.noAvailable")} description={t("version.noMatchingVersions")} />
            ) : (
              <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                {filteredInstalled.map((version) => (
                  <VersionItemCard
                    key={version.id}
                    version={version}
                    isInstalled
                    downloadingId={downloadingId}
                    onNavigate={handleNavigate}
                    onOpenWiki={handleOpenWiki}
                    onInstallLoader={handleInstallLoaderClick}
                    onDelete={handleDelete}
                    onDownload={handleDownload}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 可用版本 */}
        {activeTab === "available" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {loading && remoteVersions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-on-surface-variant animate-pulse">
                {t("common.loading")}
              </div>
            ) : remoteVersions.length === 0 ? (
              <EmptyState
                title={t("version.noAvailable")}
                description={t("version.loadFailed")}
                action={
                  <Button onClick={loadRemote}>
                    <RefreshCw size={16} className="mr-1" />
                    {t("common.retry")}
                  </Button>
                }
              />
            ) : (
              <div className="space-y-4 overflow-y-auto flex-1 pr-1">
                {/* 最新版本卡片 */}
                {(latestRelease || latestSnapshot) && categoryFilter === "all" && !searchQuery && (
                  <Card className="p-4 bg-primary-container/50 border-primary/20">
                    <h3 className="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
                      <Sparkles size={16} className="text-primary" />
                      {t("version.latestVersions")}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {latestRelease && (
                        <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high border border-outline-variant">
                          <div>
                            <p className="text-xs text-on-surface-variant">{t("version.release")}</p>
                            <p className="text-lg font-bold text-on-surface">{latestRelease.id}</p>
                            <p className="text-xs text-on-surface-variant">{formatDate(latestRelease.release_time)}</p>
                          </div>
                          <Button size="sm" onClick={() => handleDownload(latestRelease.id)} loading={downloadingId === latestRelease.id}>
                            <Download size={14} className="mr-1" />
                            {t("version.download")}
                          </Button>
                        </div>
                      )}
                      {latestSnapshot && (
                        <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high border border-outline-variant">
                          <div>
                            <p className="text-xs text-on-surface-variant">{t("version.snapshot")}</p>
                            <p className="text-lg font-bold text-on-surface">{latestSnapshot.id}</p>
                            <p className="text-xs text-on-surface-variant">{formatDate(latestSnapshot.release_time)}</p>
                          </div>
                          <Button size="sm" onClick={() => handleDownload(latestSnapshot.id)} loading={downloadingId === latestSnapshot.id}>
                            <Download size={14} className="mr-1" />
                            {t("version.download")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {/* 分类版本卡片 */}
                {groupedRemote.length === 0 ? (
                  <EmptyState title={t("version.noAvailable")} description={t("version.noMatchingVersions")} />
                ) : (
                  groupedRemote.map(({ category, versions }) => (
                    <Card key={category.key} className="overflow-hidden">
                      <div className="flex items-center gap-2 p-3 border-b border-outline-variant bg-surface-container">
                        <span className="text-primary">{category.icon}</span>
                        <h3 className="font-semibold text-on-surface">{t(category.labelKey)}</h3>
                        <Badge variant="default">{String(versions.length)}</Badge>
                      </div>
                      <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                        {versions.map((version) => (
                          <VersionItemCard
                            key={version.id}
                            version={version}
                            isInstalled={false}
                            downloadingId={downloadingId}
                            onNavigate={handleNavigate}
                            onOpenWiki={handleOpenWiki}
                            onInstallLoader={handleInstallLoaderClick}
                            onDelete={handleDelete}
                            onDownload={handleDownload}
                          />
                        ))}
                      </div>
                    </Card>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* 加载器安装卡片弹窗 */}
        <Modal
          open={!!loaderModalVersion}
          onClose={() => setLoaderModalVersion(null)}
          title={t("version.selectLoader")}
        >
          <div className="space-y-3">
            <p className="text-sm text-on-surface-variant">
              {t("version.installLoaderHint", { version: loaderModalVersion || "" })}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  className={`relative p-4 rounded-xl border border-outline-variant bg-surface-container
                    hover:border-primary/50 hover:shadow-md hover:bg-surface-container-high transition-all text-left group
                    disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-10 h-10 rounded-lg bg-surface-container-high border border-outline-variant flex items-center justify-center ${option.iconColor}`}>
                      <Puzzle size={20} />
                    </div>
                    <span className="font-semibold text-on-surface">{option.label}</span>
                  </div>
                  <p className="text-xs text-on-surface-variant">{option.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      </div>
    </PageTransition>
  );
}
