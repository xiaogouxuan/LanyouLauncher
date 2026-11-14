import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Puzzle, Trash2, ExternalLink, RefreshCw, Power, PowerOff, ListChecks, Download, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { VersionIcon } from "@/components/game/VersionIcon";
import { InstanceBadge } from "@/components/mod/InstanceBadge";
import { ModVersionSelector } from "@/components/mod/ModVersionSelector";
import { useTranslation } from "@/i18n";
import { useToast } from "@/components/ui/Toast";
import { useVersionStore } from "@/stores/versionStore";
import { modService } from "@/services/modService";
import { formatError } from "@/utils/format";
import type { ModInfo, ModVersionInfo } from "@/types/mod";
import type { LoaderType } from "@/types/version";

const GAME_VERSIONS = [
  "1.21",
  "1.20.6",
  "1.20.4",
  "1.20.1",
  "1.20",
  "1.19.4",
  "1.19.2",
  "1.18.2",
  "1.17.1",
  "1.16.5",
];

const LOADERS: LoaderType[] = ["Fabric", "Forge", "NeoForge", "Quilt"];

/** Mod 图标：加载失败时退回拼图占位，避免出现破图 */
function ModThumb({ url }: { url?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className="w-full h-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return <Puzzle size={20} className="text-primary" />;
}

export default function Mods() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { installedVersions } = useVersionStore();
  const [activeTab, setActiveTab] = useState<"installed" | "explore">("installed");

  // 目标游戏版本/实例
  const [targetVersion, setTargetVersion] = useState<string>("");

  // 已安装
  const [installedMods, setInstalledMods] = useState<ModInfo[]>([]);
  const [loadingInstalled, setLoadingInstalled] = useState(false);

  // 探索
  const [searchQuery, setSearchQuery] = useState("");
  const [versionFilter, setVersionFilter] = useState("all");
  const [loaderFilter, setLoaderFilter] = useState<LoaderType | "all">("all");
  const [searchResults, setSearchResults] = useState<ModInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [modSource, setModSource] = useState<"Modrinth" | "CurseForge">("Modrinth");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // 已安装 Mod 更新检查
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updates, setUpdates] = useState<Record<string, ModVersionInfo>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // 版本选择器
  const [selectedMod, setSelectedMod] = useState<ModInfo | null>(null);
  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<ModInfo | null>(null);

  // 从版本 ID 推断游戏版本（如 fabric-loader-0.19.3-1.16.5 → 1.16.5，1.20.1-forge-47.2.0 → 1.20.1）
  const extractGameVersion = (versionId: string): string => {
    const match = versionId.match(/(1\.\d+(?:\.\d+)?)/);
    return match ? match[0] : versionId;
  };

  // 从版本 ID 推断加载器
  const extractLoader = (versionId: string): LoaderType | undefined => {
    const lower = versionId.toLowerCase();
    if (lower.includes("fabric")) return "Fabric";
    if (lower.includes("neoforge")) return "NeoForge";
    if (lower.includes("forge")) return "Forge";
    if (lower.includes("quilt")) return "Quilt";
    return undefined;
  };

  // 当前目标版本对应的游戏版本与加载器
  const currentGameVersion = useMemo(() => {
    if (!targetVersion) return undefined;
    return extractGameVersion(targetVersion);
  }, [targetVersion]);

  const currentLoader = useMemo(() => {
    if (!targetVersion) return undefined;
    const info = installedVersions.find((v) => v.id === targetVersion);
    return info?.loader || extractLoader(targetVersion);
  }, [targetVersion, installedVersions]);

  // 当已安装版本变化时，默认选中第一个
  useEffect(() => {
    if (installedVersions.length > 0 && !targetVersion) {
      setTargetVersion(installedVersions[0].id);
    }
  }, [installedVersions, targetVersion]);

  // 根据选中的目标版本自动同步搜索过滤条件
  useEffect(() => {
    if (!targetVersion) return;
    const info = installedVersions.find((v) => v.id === targetVersion);
    if (!info) return;

    const gameVersion = extractGameVersion(info.id);
    setVersionFilter(gameVersion);

    const loader = info.loader || extractLoader(info.id);
    if (loader) {
      setLoaderFilter(loader);
    }
  }, [targetVersion, installedVersions]);

  // 加载已安装 Mod
  const loadInstalled = useCallback(async () => {
    if (!targetVersion) return;
    setLoadingInstalled(true);
    try {
      const mods = await modService.getInstalledMods(targetVersion);
      setInstalledMods(mods);
      // 手动放进 mods 目录的 Mod 没有索引信息，后台用文件哈希补全图标、简介和项目 ID
      if (mods.some((mod) => !mod.icon_url && !mod.project_id)) {
        modService
          .identifyInstalledMods(targetVersion)
          .then((enriched) => setInstalledMods(enriched))
          .catch(() => {});
      }
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setLoadingInstalled(false);
    }
  }, [showToast, targetVersion]);

  useEffect(() => {
    if (activeTab === "installed") {
      loadInstalled();
    }
  }, [activeTab, loadInstalled]);

  // 加载推荐 Mod
  const loadRecommendations = useCallback(async () => {
    setSearching(true);
    try {
      const version = versionFilter === "all" ? undefined : versionFilter;
      const loader = loaderFilter === "all" ? undefined : loaderFilter;

      const list =
        modSource === "CurseForge"
          ? await modService.searchCurseForge("", version, loader)
          : await modService.searchModrinth("", version, loader);
      setSearchResults(list);
    } catch (error) {
      setSearchResults([]);
      showToast("error", formatError(error));
    } finally {
      setSearching(false);
    }
  }, [versionFilter, loaderFilter, modSource, showToast]);

  // 进入探索页且搜索框为空时自动加载推荐
  useEffect(() => {
    if (activeTab === "explore" && !searchQuery.trim()) {
      loadRecommendations();
    }
  }, [activeTab, searchQuery, loadRecommendations]);

  // 搜索 Mod
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      await loadRecommendations();
      return;
    }

    setSearching(true);
    setSearchResults([]);

    try {
      const version = versionFilter === "all" ? undefined : versionFilter;
      const loader = loaderFilter === "all" ? undefined : loaderFilter;

      const results =
        modSource === "CurseForge"
          ? await modService.searchCurseForge(searchQuery, version, loader)
          : await modService.searchModrinth(searchQuery, version, loader);
      setSearchResults(results);
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setSearching(false);
    }
  };

  // 切换搜索源后，已有关键词时按同一关键词重新搜索；无关键词则由推荐列表自动重载
  useEffect(() => {
    if (activeTab === "explore" && searchQuery.trim()) {
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modSource]);

  // 打开版本选择器
  const handleSelectVersion = (mod: ModInfo) => {
    setSelectedMod(mod);
  };

  // 安装选中的 Mod 版本到当前版本
  const handleInstallVersion = async (version: ModVersionInfo) => {
    if (!targetVersion || !selectedMod) return;
    setDownloadingId(selectedMod.id);
    try {
      await modService.downloadMod(
        selectedMod.project_id ?? selectedMod.id,
        selectedMod.source,
        version.version_id,
        targetVersion,
      );
      showToast("success", t("mod.downloadSuccess", { name: selectedMod.name }));
      setSelectedMod(null);
      if (activeTab === "installed") {
        loadInstalled();
      }
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setDownloadingId(null);
    }
  };

  // 下载 Mod 到本地
  const handleDownloadLocal = async (version: ModVersionInfo) => {
    if (!selectedMod) return;
    setDownloadingId(selectedMod.id);
    try {
      const path = await modService.downloadModToLocal(
        selectedMod.project_id ?? selectedMod.id,
        selectedMod.source,
        version.version_id,
        version.file_name,
      );
      showToast("success", t("mod.downloadToLocalSuccess", { path }));
      setSelectedMod(null);
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setDownloadingId(null);
    }
  };

  // 切换启用状态
  const handleToggle = async (mod: ModInfo) => {
    if (!targetVersion) return;
    try {
      await modService.toggleMod(mod.id, !mod.enabled, targetVersion);
      loadInstalled();
    } catch (error) {
      showToast("error", formatError(error));
    }
  };

  // 删除 Mod（由确认弹窗触发）
  const handleDelete = async (mod: ModInfo) => {
    if (!targetVersion) return;
    try {
      await modService.deleteMod(mod.id, targetVersion);
      loadInstalled();
      showToast("success", t("common.success"));
    } catch (error) {
      showToast("error", formatError(error));
    }
  };

  // 打开当前实例的 Mods 目录
  const handleOpenModsDir = async () => {
    try {
      await modService.openModsDir(targetVersion || undefined);
    } catch (error) {
      showToast("error", formatError(error));
    }
  };

  // 检查已安装 Mod 的可用更新
  const handleCheckUpdates = async () => {
    if (!targetVersion) return;
    setCheckingUpdates(true);
    const found: Record<string, ModVersionInfo> = {};
    try {
      for (const mod of installedMods) {
        if (!mod.project_id || !mod.version_id) continue;
        try {
          const versions = await modService.getModVersions(
            mod.project_id,
            mod.source,
            currentGameVersion,
            currentLoader,
          );
          const compatible = versions.filter((v) => {
            const versionOk = !currentGameVersion || v.game_versions.includes(currentGameVersion);
            const loaderOk = !currentLoader || v.loaders.includes(currentLoader);
            return versionOk && loaderOk;
          });
          const latest = compatible[0] ?? versions[0];
          if (latest && latest.version_id !== mod.version_id) {
            found[mod.id] = latest;
          }
        } catch {
          // 单个 Mod 查询失败不影响整体检查
        }
      }
      setUpdates(found);
      const count = Object.keys(found).length;
      showToast(
        count > 0 ? "info" : "success",
        count > 0 ? t("mod.updatesFound", { count: String(count) }) : t("mod.noUpdates"),
      );
    } finally {
      setCheckingUpdates(false);
    }
  };

  // 应用更新
  const handleApplyUpdate = async (mod: ModInfo, version: ModVersionInfo) => {
    if (!targetVersion || !mod.project_id) return;
    setUpdatingId(mod.id);
    try {
      await modService.downloadMod(mod.project_id, mod.source, version.version_id, targetVersion);
      showToast("success", t("mod.updateSuccess", { name: mod.name }));
      setUpdates((current) => {
        const next = { ...current };
        delete next[mod.id];
        return next;
      });
      await loadInstalled();
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setUpdatingId(null);
    }
  };

  const versionOptions = [
    { value: "", label: t("home.versionNotSelected") },
    ...installedVersions.map((v) => ({ value: v.id, label: v.id })),
  ];

  const gameVersionOptions = [
    { value: "all", label: t("mod.allVersions") },
    ...GAME_VERSIONS.map((v) => ({ value: v, label: v })),
  ];

  const loaderOptions = [
    { value: "all", label: t("mod.allLoaders") },
    ...LOADERS.map((l) => ({ value: l, label: t(`version.${l.toLowerCase()}`) })),
  ];

  return (
    <PageTransition>
      <div className="p-5 space-y-3.5 h-full flex flex-col">
        <div className="flex items-center justify-between gap-3 shrink-0 pb-3 border-b border-outline-variant">
          <div>
            <h1 className="wallpaper-text text-[18px] font-semibold tracking-tight">{t("mod.title")}</h1>
          </div>
          <div className="segmented">
            <button
              className={`segmented-item ${activeTab === "installed" ? "segmented-item-active" : "segmented-item-idle"}`}
              onClick={() => setActiveTab("installed")}
            >
              {t("mod.installed")}
            </button>
            <button
              className={`segmented-item ${activeTab === "explore" ? "segmented-item-active" : "segmented-item-idle"}`}
              onClick={() => setActiveTab("explore")}
            >
              {t("mod.explore")}
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-[4px] bg-primary/10 flex items-center justify-center">
              <VersionIcon size={16} />
            </span>
            <span className="text-[12px] font-medium text-on-surface-variant">{t("home.currentVersion")}</span>
            <Select
              options={versionOptions}
              value={targetVersion}
              onChange={setTargetVersion}
              className="w-48"
            />
          </div>
        </div>

        {activeTab === "installed" ? (
          <div className="space-y-3 flex-1 flex flex-col overflow-hidden">
            {/* 没选版本时这些操作都没意义，直接不渲染，避免留下一排点不动的白按钮 */}
            {targetVersion && (
              <div className="flex items-center justify-end gap-2">
                <Button variant="text" size="sm" onClick={handleOpenModsDir}>
                  <FolderOpen size={14} />
                  {t("mod.openDir")}
                </Button>
                <Button
                  variant="text"
                  size="sm"
                  onClick={handleCheckUpdates}
                  disabled={checkingUpdates || installedMods.length === 0}
                >
                  <RefreshCw size={14} className={checkingUpdates ? "animate-spin" : undefined} />
                  {t("mod.checkUpdates")}
                </Button>
                <Button variant="text" size="sm" onClick={loadInstalled} disabled={loadingInstalled}>
                  <RefreshCw size={14} className={loadingInstalled ? "animate-spin" : undefined} />
                  {t("common.retry")}
                </Button>
              </div>
            )}

            {!targetVersion ? (
              <EmptyState
                title={t("home.noVersion")}
                description={t("version.downloadPrompt")}
                action={
                  <Button onClick={() => setActiveTab("explore")}>
                    <Puzzle size={16} />
                    {t("mod.explore")}
                  </Button>
                }
              />
            ) : installedMods.length === 0 ? (
              <EmptyState
                title={t("common.noData")}
                description={t("mod.emptyInstalled")}
                action={
                  <Button onClick={() => setActiveTab("explore")}>
                    <Puzzle size={16} />
                    {t("mod.explore")}
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 overflow-y-auto flex-1 pr-1">
                {installedMods.map((mod) => (
                  <Card
                    key={mod.id}
                    hover
                    onClick={() =>
                      navigate(
                        mod.project_id
                          ? `/mods/${mod.project_id}?source=${mod.source}`
                          : `/mods/${mod.id}`,
                        { state: { mod } },
                      )
                    }
                    className="flex items-center gap-3 p-3 animate-fade-in"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      <ModThumb url={mod.icon_url} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-on-surface truncate">{mod.name}</span>
                        <Badge variant={mod.enabled ? "info" : "default"}>
                          {mod.enabled ? t("mod.enable") : t("mod.disable")}
                        </Badge>
                        <Badge>{mod.source}</Badge>
                        <InstanceBadge instanceId={mod.instance_id} isIsolated={mod.is_isolated} />
                      </div>
                      {mod.description && (
                        <p className="text-xs text-on-surface-variant/80 truncate">
                          {mod.description}
                        </p>
                      )}
                      <p className="text-xs text-on-surface-variant truncate">
                        {[mod.version, mod.game_version && `MC ${mod.game_version}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {mod.install_path && (
                        <p className="text-xs text-on-surface-variant/70 truncate mt-0.5">
                          {t("mod.installPath")}: {mod.install_path}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {updates[mod.id] && (
                        <Button
                          variant="filled"
                          size="sm"
                          loading={updatingId === mod.id}
                          disabled={updatingId !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApplyUpdate(mod, updates[mod.id]);
                          }}
                          title={t("mod.updateAvailable", {
                            version: updates[mod.id].version_number,
                          })}
                        >
                          <Download size={14} />
                          {t("mod.update")}
                        </Button>
                      )}
                      <Button
                        variant="quiet"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggle(mod);
                        }}
                        title={mod.enabled ? t("mod.disable") : t("mod.enable")}
                      >
                        {mod.enabled ? <PowerOff size={16} /> : <Power size={16} />}
                      </Button>
                      <Button
                        variant="quiet"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(mod);
                        }}
                        title={t("mod.delete")}
                      >
                        <Trash2 size={16} className="text-error" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-medium text-on-surface-variant">
                {t("mod.searchSource")}
              </span>
              <div className="segmented">
                <button
                  className={`segmented-item ${modSource === "Modrinth" ? "segmented-item-active" : "segmented-item-idle"}`}
                  onClick={() => setModSource("Modrinth")}
                >
                  Modrinth
                </button>
                <button
                  className={`segmented-item ${modSource === "CurseForge" ? "segmented-item-active" : "segmented-item-idle"}`}
                  onClick={() => setModSource("CurseForge")}
                >
                  CurseForge
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <Input
                placeholder={t("mod.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={searching}>
                <Search size={16} />
                {searching ? t("mod.searching") : t("mod.search")}
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select options={gameVersionOptions} value={versionFilter} onChange={setVersionFilter} placeholder={t("mod.versionFilter")} />
              <Select options={loaderOptions} value={loaderFilter} onChange={(v) => setLoaderFilter(v as LoaderType | "all")} placeholder={t("mod.loaderFilter")} />
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-3">
              {searching && searchResults.length === 0 && (
                <div className="grid grid-cols-1 gap-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className="flex gap-3 p-3 rounded-card border border-outline-variant bg-surface-high animate-pulse"
                    >
                      <div className="w-12 h-12 rounded-lg bg-surface-container shrink-0" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-3 w-1/3 rounded bg-surface-container" />
                        <div className="h-3 w-2/3 rounded bg-surface-container" />
                        <div className="h-3 w-1/4 rounded bg-surface-container" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!searching && searchResults.length === 0 && searchQuery.trim() === "" && (
                <EmptyState title={t("common.noData")} description={t("mod.emptySearch")} />
              )}

              {!searching && searchResults.length === 0 && searchQuery.trim() !== "" && (
                <EmptyState title={t("common.noData")} description={t("mod.noResults")} />
              )}

              {searchResults.length > 0 && (
                <div className="flex items-center gap-2">
                  <Badge variant={searchQuery.trim() === "" ? "info" : "default"}>
                    {searchQuery.trim() === "" ? t("mod.recommendations") : t("mod.resultCount", { count: String(searchResults.length) })}
                  </Badge>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                {searchResults.map((mod) => (
                  <Card
                    key={`${mod.source}-${mod.id}`}
                    hover
                    onClick={() => navigate(`/mods/${mod.project_id ?? mod.id}`, { state: { mod } })}
                    className="flex gap-3 p-3 animate-fade-in"
                  >
                    <div className="w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {mod.icon_url ? (
                        <img src={mod.icon_url} alt={mod.name} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <Puzzle size={24} className="text-on-surface-variant" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-on-surface truncate">{mod.name}</span>
                        <Badge>{mod.source === "Modrinth" ? t("mod.sourceModrinth") : t("mod.sourceCurseForge")}</Badge>
                        {mod.loader && (
                          <Badge variant="default" className="gap-1">
                            <VersionIcon loader={mod.loader} size={14} />
                            {t(`version.${mod.loader.toLowerCase()}`)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-on-surface-variant line-clamp-2">{mod.description}</p>
                      <div className="flex items-center gap-3 text-xs text-on-surface-variant">
                        {mod.version && (
                          <span>
                            {t("mod.gameVersion")}: {mod.game_version || mod.version}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectVersion(mod);
                        }}
                        disabled={downloadingId === mod.id || !targetVersion}
                      >
                        {downloadingId === mod.id ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            {t("mod.downloading")}
                          </>
                        ) : (
                          <>
                            <ListChecks size={14} />
                            {t("mod.selectVersion")}
                          </>
                        )}
                      </Button>
                      <a
                        href={`https://${mod.source === "Modrinth" ? "modrinth.com/mod" : "curseforge.com/minecraft/mc-mods"}/${mod.project_id ?? mod.id}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-primary hover:underline flex items-center gap-0.5"
                      >
                        {t("mod.source")}
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        <ModVersionSelector
          mod={selectedMod}
          targetVersion={targetVersion}
          gameVersion={currentGameVersion}
          loader={currentLoader}
          open={selectedMod !== null}
          onClose={() => setSelectedMod(null)}
          onInstall={handleInstallVersion}
          onDownloadLocal={handleDownloadLocal}
        />

        <ConfirmDialog
          open={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            if (deleteTarget) handleDelete(deleteTarget);
          }}
          title={t("mod.delete")}
          message={t("mod.deleteConfirm")}
          confirmText={t("common.delete")}
          danger
        />
      </div>
    </PageTransition>
  );
}
