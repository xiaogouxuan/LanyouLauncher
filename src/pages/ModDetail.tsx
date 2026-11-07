import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { ChevronLeft, Puzzle, ExternalLink, HardDrive, Download, Package } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/EmptyState";
import { VersionIcon } from "@/components/game/VersionIcon";
import { useTranslation } from "@/i18n";
import { useToast } from "@/components/ui/Toast";
import { useVersionStore } from "@/stores/versionStore";
import { openUrl } from "@/utils/openUrl";
import { modService } from "@/services/modService";
import { formatError, formatFileSize } from "@/utils/format";
import type { ModInfo, ModVersionInfo } from "@/types/mod";

export default function ModDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { installedVersions } = useVersionStore();

  const source = searchParams.get("source") ?? "Modrinth";
  const [mod, setMod] = useState<ModInfo | undefined>(
    (location.state as { mod?: ModInfo } | undefined)?.mod,
  );
  const [loadingMod, setLoadingMod] = useState(false);

  const [versions, setVersions] = useState<ModVersionInfo[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [targetVersion, setTargetVersion] = useState<string>("");
  const [downloading, setDownloading] = useState<"install" | "local" | null>(null);

  // 入口未携带 Mod 信息时（首页推荐、直接输入链接），按项目 ID 拉取详情
  useEffect(() => {
    if (mod || !id) return;
    let cancelled = false;
    setLoadingMod(true);
    modService
      .getModDetails(id, source)
      .then((data) => {
        if (!cancelled) setMod(data);
      })
      .catch((error) => {
        if (!cancelled) showToast("error", formatError(error));
      })
      .finally(() => {
        if (!cancelled) setLoadingMod(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, mod, source, showToast]);

  // 默认选中第一个已安装版本作为安装目标
  useEffect(() => {
    if (installedVersions.length > 0 && !targetVersion) {
      setTargetVersion(installedVersions[0].id);
    }
  }, [installedVersions, targetVersion]);

  // 当前目标实例的游戏版本与加载器，用于过滤可用版本
  const targetGameVersion = useMemo(() => {
    const match = targetVersion.match(/(1\.\d+(?:\.\d+)?)/);
    return match ? match[0] : mod?.game_version || "";
  }, [targetVersion, mod]);

  const targetLoader = useMemo(() => {
    const info = installedVersions.find((version) => version.id === targetVersion);
    return info?.loader ?? mod?.loader;
  }, [installedVersions, targetVersion, mod]);

  // 获取 Mod 版本列表
  useEffect(() => {
    if (!mod) return;
    // 本地已安装的模组可能没有 project_id，无法在线查询版本，直接跳过
    const projectKey = mod.project_id ?? mod.id;
    if (mod.install_path && !mod.project_id) {
      setVersions([]);
      setLoadingVersions(false);
      return;
    }
    let cancelled = false;
    setLoadingVersions(true);
    modService
      .getModVersions(
        projectKey,
        mod.source,
        targetGameVersion || undefined,
        targetLoader || undefined,
      )
      .then((data) => {
        if (cancelled) return;
        setVersions(data);
        if (data.length > 0) {
          setSelectedVersionId(data[0].version_id);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        showToast("error", formatError(error));
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mod, targetGameVersion, targetLoader, showToast]);

  const selectedVersion = useMemo(
    () => versions.find((v) => v.version_id === selectedVersionId) || null,
    [versions, selectedVersionId],
  );

  const targetVersionInfo = useMemo(
    () => installedVersions.find((v) => v.id === targetVersion),
    [installedVersions, targetVersion],
  );

  const handleOpenSource = () => {
    if (!mod) return;
    const projectKey = mod.project_id ?? mod.id;
    const url =
      mod.source === "Modrinth"
        ? `https://modrinth.com/mod/${projectKey}`
        : `https://curseforge.com/minecraft/mc-mods/${projectKey}`;
    openUrl(url).catch(() => {
      showToast("error", t("errors.system.openUrlFailed", { detail: url }));
    });
  };

  const handleInstall = async () => {
    if (!mod || !selectedVersion || !targetVersion) return;
    setDownloading("install");
    try {
      await modService.downloadMod(mod.project_id ?? mod.id, mod.source, selectedVersion.version_id, targetVersion);
      showToast("success", t("mod.downloadSuccess", { name: mod.name }));
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadLocal = async () => {
    if (!mod || !selectedVersion) return;
    setDownloading("local");
    try {
      const path = await modService.downloadModToLocal(
        mod.project_id ?? mod.id,
        mod.source,
        selectedVersion.version_id,
        selectedVersion.file_name,
      );
      showToast("success", t("mod.downloadToLocalSuccess", { path }));
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setDownloading(null);
    }
  };

  const versionOptions = useMemo(
    () => [
      { value: "", label: t("home.versionNotSelected") },
      ...installedVersions.map((v) => ({ value: v.id, label: v.id })),
    ],
    [installedVersions, t],
  );

  return (
    <PageTransition>
      <div className="p-5 space-y-3.5 h-full flex flex-col overflow-y-auto">
        <Button
          variant="text"
          size="sm"
          onClick={() => (location.key === "default" ? navigate("/mods") : navigate(-1))}
          className="w-fit"
        >

          <ChevronLeft size={16} />
          {t("common.back")}
        </Button>

        {!mod ? (
          <>
            <h1 className="wallpaper-text text-[18px] font-semibold tracking-tight">{id}</h1>
            <Card>
              <p className="text-sm text-on-surface-variant">
                {loadingMod ? t("common.loading") : t("mod.detailComingSoon")}
              </p>
            </Card>
          </>
        ) : (
          <>
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-card bg-primary/8 border border-outline-variant flex items-center justify-center flex-shrink-0 overflow-hidden">
                {mod.icon_url ? (
                  <img src={mod.icon_url} alt={mod.name} className="w-full h-full object-cover" />
                ) : (
                  <Puzzle size={32} className="text-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="wallpaper-text text-[18px] font-semibold tracking-tight truncate">{mod.name}</h1>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge>{mod.source === "Modrinth" ? t("mod.sourceModrinth") : t("mod.sourceCurseForge")}</Badge>
                  {mod.loader && (
                    <Badge className="gap-1">
                      <VersionIcon loader={mod.loader} size={14} />
                      {t(`version.${mod.loader.toLowerCase()}`)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <Card>
              <h3 className="text-sm font-semibold text-on-surface mb-2">{t("mod.descriptionTitle")}</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                {mod.description || t("mod.noDescription")}
              </p>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-on-surface mb-4">{t("mod.basicInfo")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-on-surface-variant mb-0.5">{t("mod.gameVersion")}</p>
                  <p className="text-on-surface font-medium">{mod.game_version || t("mod.allVersions")}</p>
                </div>
                <div>
                  <p className="text-on-surface-variant mb-0.5">{t("mod.fileVersion")}</p>
                  <p className="text-on-surface font-medium">{selectedVersion?.version_number || "-"}</p>
                </div>
                <div>
                  <p className="text-on-surface-variant mb-0.5">{t("mod.loaderFilter")}</p>
                  <p className="text-on-surface font-medium">
                    {mod.loader ? t(`version.${mod.loader.toLowerCase()}`) : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-on-surface-variant mb-0.5">{t("mod.source")}</p>
                  <p className="text-on-surface font-medium">
                    {mod.source === "Modrinth" ? t("mod.sourceModrinth") : t("mod.sourceCurseForge")}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-on-surface">{t("mod.selectVersion")}</h3>
                {targetVersionInfo?.loader && <VersionIcon loader={targetVersionInfo.loader} size={20} />}
              </div>

              {loadingVersions ? (
                <div className="py-8 text-center text-on-surface-variant animate-pulse">{t("mod.fetchingVersions")}</div>
              ) : versions.length === 0 ? (
                <EmptyState title={t("common.noData")} description={t("mod.noCompatibleVersion")} />
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {versions.map((version) => (
                      <button
                        key={version.version_id}
                        type="button"
                        onClick={() => setSelectedVersionId(version.version_id)}
                        className={`w-full text-left rounded-card border p-3 transition-colors ${
                          selectedVersionId === version.version_id
                            ? "border-primary bg-primary/8"
                            : "border-outline-variant bg-surface-container hover:bg-surface-container-high"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="font-semibold text-on-surface">{version.version_number}</p>
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
                            <p className="text-xs text-on-surface-variant flex items-center gap-1">
                              <HardDrive size={12} />
                              {formatFileSize(version.file_size)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {version.loaders.map((ld) => (
                              <VersionIcon key={ld} loader={ld} size={18} />
                            ))}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-outline-variant pt-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-on-surface-variant">{t("home.currentVersion")}</span>
                      <select
                        value={targetVersion}
                        onChange={(e) => setTargetVersion(e.target.value)}
                        className="bg-surface-container border border-outline-variant rounded-lg px-3 py-1.5 text-on-surface outline-none focus:border-primary"
                      >
                        {versionOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outlined" size="sm" onClick={handleOpenSource}>
                        <ExternalLink size={16} />
                        {t("mod.viewPage", { source: mod.source })}
                      </Button>
                      <Button
                        variant="tonal"
                        size="sm"
                        onClick={handleDownloadLocal}
                        disabled={!selectedVersion || downloading !== null}
                        loading={downloading === "local"}
                      >
                        <Download size={16} />
                        {t("mod.downloadToLocal")}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleInstall}
                        disabled={!selectedVersion || !targetVersion || downloading !== null}
                        loading={downloading === "install"}
                      >
                        <Package size={16} />
                        {targetVersion ? t("mod.installToCurrent") : t("home.selectVersion")}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </PageTransition>
  );
}
