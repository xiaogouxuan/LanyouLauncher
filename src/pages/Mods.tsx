import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Download, Puzzle, Trash2, ExternalLink, RefreshCw, Power, PowerOff, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/EmptyState";
import { useTranslation } from "@/i18n";
import { useToast } from "@/components/ui/Toast";
import { useVersionStore } from "@/stores/versionStore";
import { modService } from "@/services/modService";
import { formatError } from "@/utils/format";
import type { ModInfo, ModSource } from "@/types/mod";
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
  const [sourceFilter, setSourceFilter] = useState<ModSource | "all">("Modrinth");
  const [versionFilter, setVersionFilter] = useState("all");
  const [loaderFilter, setLoaderFilter] = useState<LoaderType | "all">("all");
  const [searchResults, setSearchResults] = useState<ModInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // 从版本 ID 推断游戏版本（如 fabric-loader-0.19.3-1.16.5 → 1.16.5）
  const extractGameVersion = (versionId: string): string => {
    // 匹配末尾的 Minecraft 版本号
    const match = versionId.match(/(\d+\.\d+(\.\d+)?)$/);
    return match ? match[0] : versionId;
  };

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

    const loader = info.loader || (info.id.toLowerCase().includes("fabric") ? "Fabric" :
                    info.id.toLowerCase().includes("forge") ? "Forge" :
                    info.id.toLowerCase().includes("quilt") ? "Quilt" : null);
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
    setSearchResults([]);
    try {
      const version = versionFilter === "all" ? undefined : versionFilter;
      const loader = loaderFilter === "all" ? undefined : loaderFilter;

      let results: ModInfo[] = [];
      if (sourceFilter === "all" || sourceFilter === "Modrinth") {
        const modrinth = await modService.getRecommendations();
        results = results.concat(modrinth);
      }
      if (sourceFilter === "all" || sourceFilter === "CurseForge") {
        const curseforge = await modService.searchCurseForge("", version, loader);
        results = results.concat(curseforge);
      }
      setSearchResults(results);
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setSearching(false);
    }
  }, [sourceFilter, versionFilter, loaderFilter, showToast]);

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

      let results: ModInfo[] = [];
      const hasChinese = /[\u4e00-\u9fa5]/.test(searchQuery);

      if (hasChinese) {
        showToast("info", t("mod.searchingBothSources"));
        const [modrinthResult, curseforgeResult] = await Promise.allSettled([
          modService.searchModrinth(searchQuery, version, loader),
          modService.searchCurseForge(searchQuery, version, loader),
        ]);
        if (modrinthResult.status === "fulfilled") {
          results = results.concat(modrinthResult.value);
        }
        if (curseforgeResult.status === "fulfilled") {
          results = results.concat(curseforgeResult.value);
        }
      } else {
        if (sourceFilter === "all" || sourceFilter === "Modrinth") {
          const modrinth = await modService.searchModrinth(searchQuery, version, loader);
          results = results.concat(modrinth);
        }
        if (sourceFilter === "all" || sourceFilter === "CurseForge") {
          const curseforge = await modService.searchCurseForge(searchQuery, version, loader);
          results = results.concat(curseforge);
        }
      }

      setSearchResults(results);
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setSearching(false);
    }
  };

  // 下载 Mod
  const handleDownload = async (mod: ModInfo) => {
    if (!targetVersion) {
      showToast("error", t("home.selectVersion"));
      return;
    }
    setDownloadingId(mod.id);
    try {
      await modService.downloadMod(mod.id, mod.source, mod.version_id || undefined, targetVersion);
      showToast("success", t("mod.downloadSuccess", { name: mod.name }));
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

  // 删除 Mod
  const handleDelete = async (mod: ModInfo) => {
    if (!targetVersion) return;
    if (!confirm(t("mod.deleteConfirm"))) return;
    try {
      await modService.deleteMod(mod.id, targetVersion);
      loadInstalled();
      showToast("success", t("common.success"));
    } catch (error) {
      showToast("error", formatError(error));
    }
  };

  const versionOptions = [
    { value: "", label: t("home.versionNotSelected") },
    ...installedVersions.map((v) => ({ value: v.id, label: v.id })),
  ];

  const sourceOptions = [
    { value: "Modrinth", label: t("mod.sourceModrinth") },
    { value: "CurseForge", label: t("mod.sourceCurseForge") },
    { value: "all", label: t("mod.allSources") },
  ];

  const gameVersionOptions = [
    { value: "all", label: t("mod.allVersions") },
    ...GAME_VERSIONS.map((v) => ({ value: v, label: v })),
  ];

  const loaderOptions = [
    { value: "all", label: t("mod.allLoaders") },
    ...LOADERS.map((l) => ({ value: l, label: t(`version.${l.toLowerCase()}`) })),
  ];

  const TargetVersionSelector = () => (
    <div className="flex items-center gap-2">
      <Gamepad2 size={16} className="text-on-surface-variant" />
      <span className="text-sm text-on-surface-variant">{t("home.currentVersion")}</span>
      <Select
        options={versionOptions}
        value={targetVersion}
        onChange={setTargetVersion}
        className="w-48"
      />
    </div>
  );

  return (
    <PageTransition>
      <div className="p-6 space-y-4 h-full flex flex-col">
        <h1 className="text-2xl font-bold text-on-surface">{t("mod.title")}</h1>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button variant={activeTab === "installed" ? "filled" : "tonal"} size="sm" onClick={() => setActiveTab("installed")}>
              {t("mod.installed")}
            </Button>
            <Button variant={activeTab === "explore" ? "filled" : "tonal"} size="sm" onClick={() => setActiveTab("explore")}>
              {t("mod.explore")}
            </Button>
          </div>
          <TargetVersionSelector />
        </div>

        {activeTab === "installed" ? (
          <div className="space-y-3 flex-1 flex flex-col overflow-hidden">
            <div className="flex justify-end">
              <Button variant="tonal" size="sm" onClick={loadInstalled} disabled={loadingInstalled || !targetVersion}>
                <RefreshCw size={14} className={`mr-1 ${loadingInstalled ? "animate-spin" : ""}`} />
                {t("common.retry")}
              </Button>
            </div>

            {!targetVersion ? (
              <EmptyState
                title={t("home.noVersion")}
                description={t("version.downloadPrompt")}
                action={
                  <Button onClick={() => setActiveTab("explore")}>
                    <Puzzle size={16} className="mr-1" />
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
                    <Puzzle size={16} className="mr-1" />
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
                    onClick={() => navigate(`/mods/${mod.id}`, { state: { mod } })}
                    className="flex items-center gap-3 p-3 animate-fade-in"
                  >
                    <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center flex-shrink-0">
                      <Puzzle size={20} className="text-on-surface-variant" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-on-surface truncate">{mod.name}</span>
                        <Badge variant={mod.enabled ? "success" : "default"}>
                          {mod.enabled ? t("mod.enable") : t("mod.disable")}
                        </Badge>
                        <Badge>{mod.source}</Badge>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate">{mod.version || mod.game_version || ""}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="text"
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
                        variant="text"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(mod);
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
            <div className="flex gap-3">
              <Input
                placeholder={t("mod.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={searching}>
                <Search size={16} className="mr-1" />
                {searching ? t("mod.searching") : t("mod.search")}
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select options={sourceOptions} value={sourceFilter} onChange={(v) => setSourceFilter(v as ModSource | "all")} placeholder={t("mod.source")} />
              <Select options={gameVersionOptions} value={versionFilter} onChange={setVersionFilter} placeholder={t("mod.versionFilter")} />
              <Select options={loaderOptions} value={loaderFilter} onChange={(v) => setLoaderFilter(v as LoaderType | "all")} placeholder={t("mod.loaderFilter")} />
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-3">
              {!searching && searchResults.length === 0 && searchQuery.trim() === "" && (
                <EmptyState title={t("common.noData")} description={t("mod.emptySearch")} />
              )}

              {!searching && searchResults.length === 0 && searchQuery.trim() !== "" && (
                <EmptyState title={t("common.noData")} description={t("mod.noResults")} />
              )}

              {searchResults.length > 0 && (
                <p className="text-xs text-on-surface-variant">
                  {searchQuery.trim() === "" ? t("mod.recommendations") : t("mod.resultCount", { count: String(searchResults.length) })}
                </p>
              )}

              <div className="grid grid-cols-1 gap-3">
                {searchResults.map((mod) => (
                  <Card
                    key={`${mod.source}-${mod.id}`}
                    hover
                    onClick={() => navigate(`/mods/${mod.id}`, { state: { mod } })}
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
                        {mod.loader && <Badge variant="default">{t(`version.${mod.loader.toLowerCase()}`)}</Badge>}
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
                          handleDownload(mod);
                        }}
                        disabled={downloadingId === mod.id || !targetVersion}
                      >
                        {downloadingId === mod.id ? (
                          <>
                            <RefreshCw size={14} className="mr-1 animate-spin" />
                            {t("mod.downloading")}
                          </>
                        ) : (
                          <>
                            <Download size={14} className="mr-1" />
                            {t("mod.download")}
                          </>
                        )}
                      </Button>
                      <a
                        href={`https://${mod.source === "Modrinth" ? "modrinth.com/mod" : "curseforge.com/minecraft/mc-mods"}/${mod.id}`}
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
      </div>
    </PageTransition>
  );
}
