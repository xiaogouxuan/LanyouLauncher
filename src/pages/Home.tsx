import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Play,
  Square,
  Terminal,
  ChevronDown,
  ChevronUp,
  X,
  Copy,
  Check,
  SlidersHorizontal,
  AlertTriangle,
  Zap,
  BookOpen,
  ArrowRight,
  FolderOpen,
  FileArchive,
  Upload,
} from "lucide-react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Modal } from "@/components/ui/Modal";
import { PageTransition } from "@/components/common/PageTransition";
import { SkinAvatar } from "@/components/account/SkinAvatar";
import { VersionCard } from "@/components/game/VersionCard";
import { VersionIcon } from "@/components/game/VersionIcon";
import sodiumIcon from "@/assets/icons/mods/sodium.png";
import jeiIcon from "@/assets/icons/mods/jei.png";
import { useTranslation } from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { useVersionStore } from "@/stores/versionStore";
import { useLaunchStore } from "@/stores/launchStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToast } from "@/components/ui/Toast";
import { launchService } from "@/services/launchService";
import { versionService } from "@/services/versionService";
import { accountService } from "@/services/accountService";
import { modService } from "@/services/modService";
import type { ModInfo, ModSource } from "@/types/mod";
import { settingsService, type SystemInfo } from "@/services/settingsService";
import { formatMemory, formatError } from "@/utils/format";
import { analyzeCrash, type CrashCategory } from "@/utils/crashAnalyzer";
import type { LaunchConfig } from "@/types/launch";
import type { ModpackFormat, ModpackImportProgress } from "@/types/version";

const LAUNCH_OPTIONS_KEY = "lanyou.launch_options";

const RESOLUTION_PRESETS = [
  { value: "854x480", width: 854, height: 480 },
  { value: "1280x720", width: 1280, height: 720 },
  { value: "1600x900", width: 1600, height: 900 },
  { value: "1920x1080", width: 1920, height: 1080 },
];

interface LaunchOptions {
  memory: number;
  resolution: string;
  customWidth: number;
  customHeight: number;
  jvmArgs: string;
}

const DEFAULT_LAUNCH_OPTIONS: LaunchOptions = {
  memory: 4096,
  resolution: "1280x720",
  customWidth: 1280,
  customHeight: 720,
  jvmArgs: "",
};

type GreetingPeriod = "morning" | "afternoon" | "evening" | "night";

/**
 * 首页推荐的模组条目。
 * 网络不可用时使用内置的编辑推荐，保证首页不会出现空白区域。
 */
interface RecommendedMod {
  key: string;
  /** 平台内的项目 ID，用于跳转到模组详情 */
  id: string;
  source: ModSource;
  name: string;
  description: string;
  iconUrl: string | null;
  icon: "zap" | "book";
  /** 在线结果携带完整信息，可直接带入详情页，省去重复请求 */
  detail?: ModInfo;
}

/**
 * 根据当前时间把问候语划分为四个时段。
 * 问候语按访问时刻选择，上午、下午、傍晚、深夜各自使用不同的文案组。
 */
function getGreetingPeriod(): GreetingPeriod {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 23) return "evening";
  return "night";
}

async function closeLauncher() {
  try {
    const { exit } = await import("@tauri-apps/plugin-process");
    await exit(0);
  } catch (error) {
    console.error("Failed to close launcher:", error);
    window.close();
  }
}

/**
 * 读取本地保存的启动参数。
 * 存储内容可能被外部改动或损坏，解析失败时直接回退到默认值，避免启动页异常。
 */
function readLaunchOptions(): LaunchOptions {
  try {
    const raw = localStorage.getItem(LAUNCH_OPTIONS_KEY);
    if (raw) {
      return { ...DEFAULT_LAUNCH_OPTIONS, ...JSON.parse(raw) };
    }
  } catch {
    // 读取失败时使用默认配置
  }
  return { ...DEFAULT_LAUNCH_OPTIONS };
}

export default function Home() {
  const { t, language } = useTranslation();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const activeAccount = useAccountStore((s) => s.activeAccount);
  const installedVersions = useVersionStore((s) => s.installedVersions);
  const setInstalledVersions = useVersionStore((s) => s.setInstalledVersions);
  const { settings } = useSettingsStore();
  const {
    isLaunching,
    isRunning,
    logs,
    launchProgress,
    runningInstances,
    setLaunchConfig,
    setIsLaunching,
    appendLog,
    clearLogs,
    resetLaunchProgress,
  } = useLaunchStore();

  const logsRef = useRef<HTMLDivElement>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [targetVersion, setTargetVersion] = useState<string>("");
  const [selectedJava, setSelectedJava] = useState<string>("");
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [options, setOptions] = useState<LaunchOptions>(readLaunchOptions);
  const [crashCategory, setCrashCategory] = useState<CrashCategory | null>(null);
  const [recommendedMods, setRecommendedMods] = useState<RecommendedMod[]>([]);

  // 整合包拖拽导入
  const [dragActive, setDragActive] = useState(false);
  const [pendingPack, setPendingPack] = useState<string | null>(null);
  const [importFormat, setImportFormat] = useState<ModpackFormat>("auto");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ModpackImportProgress | null>(null);

  // 监听窗口级拖拽事件：Tauri 才能拿到真实的文件路径
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setDragActive(true);
          return;
        }
        if (payload.type === "drop") {
          setDragActive(false);
          const archive = payload.paths.find((path) => /\.(zip|mrpack)$/i.test(path));
          if (archive) {
            setImportFormat("auto");
            setPendingPack(archive);
          } else if (payload.paths.length > 0) {
            showToast("error", t("modpack.dropUnsupported"));
          }
          return;
        }
        setDragActive(false);
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [showToast, t]);

  // 导入过程中同步后端进度
  useEffect(() => {
    if (!importing) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;

    listen<ModpackImportProgress>("modpack-import-progress", (event) => {
      setImportProgress(event.payload);
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [importing]);

  const period = useMemo(() => getGreetingPeriod(), []);

  // 同一时段内随机抽取一条问候语，切换语言时按新语言重新取
  const greetingIndex = useMemo(() => Math.floor(Math.random() * 8), [language]);

  const greeting = useMemo(() => {
    const list = t(`home.greetings.${period}`, { returnObjects: true }) as string[];
    if (!Array.isArray(list) || list.length === 0) return t("home.readyToPlay");
    return list[greetingIndex % list.length];
  }, [t, language, period, greetingIndex]);

  // 在线推荐失败时的兜底内容，两项足够说明“热门模组”入口
  const fallbackMods = useMemo<RecommendedMod[]>(
    () => [
      {
        key: "modrinth-AANobbMI",
        id: "AANobbMI",
        source: "Modrinth",
        name: t("home.modFallbackSodium"),
        description: t("home.modFallbackSodiumDesc"),
        iconUrl: sodiumIcon,
        icon: "zap",
      },
      {
        key: "modrinth-u6dRKJwZ",
        id: "u6dRKJwZ",
        source: "Modrinth",
        name: t("home.modFallbackJei"),
        description: t("home.modFallbackJeiDesc"),
        iconUrl: jeiIcon,
        icon: "book",
      },
    ],
    [t, language],
  );

  useEffect(() => {
    if (installedVersions.length === 0 || targetVersion) return;
    const saved = localStorage.getItem("lanyou.last_selected_version");
    if (saved && installedVersions.some((version) => version.id === saved)) {
      setTargetVersion(saved);
    } else {
      setTargetVersion(installedVersions[0].id);
    }
  }, [installedVersions, targetVersion]);

  useEffect(() => {
    settingsService
      .getSystemInfo()
      .then((info) => setSystemInfo(info))
      .catch(() => {});
  }, []);

  const selectedVersion = installedVersions.find((version) => version.id === targetVersion) ?? null;

  /**
   * 首页只展示两个热门模组，且必须与当前游戏版本、加载器匹配，
   * 否则点进详情只会看到“无兼容版本”。网络异常时回退到内置推荐。
   */
  const recommendationKey = selectedVersion
    ? `${selectedVersion.id}|${selectedVersion.loader ?? ""}`
    : "";

  useEffect(() => {
    if (!selectedVersion) return;
    let cancelled = false;
    const match = selectedVersion.id.match(/(1\.\d+(?:\.\d+)?)/);
    modService
      .searchModrinth("", match?.[1], selectedVersion.loader ?? undefined)
      .then((list) => {
        if (cancelled) return;
        setRecommendedMods(
          list.slice(0, 2).map((mod) => ({
            key: `${mod.source}-${mod.id}`,
            id: mod.id,
            source: mod.source,
            name: mod.name,
            description: mod.description,
            iconUrl: mod.icon_url,
            icon: "zap" as const,
            detail: mod,
          })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendationKey]);

  useEffect(() => {
    if (!targetVersion || !selectedVersion) return;

    if (selectedVersion.java_path) {
      setSelectedJava(selectedVersion.java_path);
      return;
    }

    const javaPath = settings.java_paths[0] ?? "java";
    if (javaPath === "java" && settings.java_paths.length === 0) {
      setSelectedJava("java");
      return;
    }
    settingsService
      .selectJavaForVersion(targetVersion)
      .then(([path]) => setSelectedJava(path))
      .catch(() => setSelectedJava(javaPath));
  }, [targetVersion, settings.java_paths, selectedVersion]);

  useEffect(() => {
    if (targetVersion) {
      localStorage.setItem("lanyou.last_selected_version", targetVersion);
    }
  }, [targetVersion]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  /**
   * 启动结束后从最后一条错误日志推断崩溃原因。
   * 只在非启动阶段执行，避免把加载过程中的普通错误误判为崩溃。
   */
  useEffect(() => {
    if (isLaunching) return;
    const lastError = [...logs].reverse().find((log) => log.level === "error");
    if (!lastError) return;
    const category = analyzeCrash(lastError.message);
    if (category) setCrashCategory(category);
  }, [logs, isLaunching]);

  const handleCopyLogs = async () => {
    if (logs.length === 0) return;
    const text = logs
      .map((log) => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.message}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 2000);
    } catch {
      showToast("error", t("home.copyLogsFailed"));
    }
  };

  const resolveResolution = () => {
    const preset = RESOLUTION_PRESETS.find((item) => item.value === options.resolution);
    if (preset) {
      return { width: preset.width, height: preset.height };
    }
    return {
      width: Math.max(320, options.customWidth || 1280),
      height: Math.max(240, options.customHeight || 720),
    };
  };

  const handleSaveOptions = () => {
    localStorage.setItem(LAUNCH_OPTIONS_KEY, JSON.stringify(options));
    setOptionsOpen(false);
    showToast("success", t("more.launchOptionsSaved"));
  };

  const handleLaunch = async () => {
    if (!activeAccount) {
      showToast("error", t("home.selectAccount"));
      navigate("/accounts");
      return;
    }
    if (!selectedVersion) {
      showToast("error", t("home.selectVersion"));
      return;
    }

    const javaPath = selectedJava || settings.java_paths[0] || "java";
    const memory = options.memory || systemInfo?.recommended_memory_mb || settings.default_memory;
    const resolution = resolveResolution();

    /*
     * 微软账号在启动前静默刷新令牌，避免令牌刚好过期导致启动失败。
     * 刷新失败不阻断启动，具体错误交给后端返回。
     */
    if (
      activeAccount.account_type === "Microsoft" &&
      activeAccount.expires_at &&
      activeAccount.expires_at * 1000 < Date.now() + 5 * 60 * 1000
    ) {
      try {
        await accountService.refreshToken(activeAccount.id);
      } catch {
        // 刷新失败时继续尝试启动，由后端返回具体错误
      }
    }

    const config: LaunchConfig = {
      version_id: selectedVersion.id,
      account_id: activeAccount.id,
      java_path: javaPath,
      memory_min: Math.max(512, Math.floor(memory * 0.25)),
      memory_max: memory,
      jvm_args: options.jvmArgs.split(/\s+/).filter(Boolean),
      resolution_width: resolution.width,
      resolution_height: resolution.height,
      game_dir: selectedVersion.game_dir || settings.default_game_dir || null,
    };

    setLaunchConfig(config);
    setIsLaunching(true);
    resetLaunchProgress();
    clearLogs();
    setCrashCategory(null);
    setShowLogs(false);

    try {
      await launchService.startGame(config);
      showToast("success", t("home.launchSuccess"));
      if (settings.close_after_launch) {
        await closeLauncher();
      }
    } catch (error) {
      appendLog({
        level: "error",
        message: String(error),
        timestamp: Date.now(),
      });
      setCrashCategory(analyzeCrash(String(error)));
      showToast("error", String(error));
    } finally {
      setIsLaunching(false);
      setShowLogs(false);
    }
  };

  const handleOpenGameDir = async () => {
    try {
      await settingsService.openGameDir(selectedVersion?.game_dir || settings.default_game_dir || undefined);
    } catch (error) {
      showToast("error", formatError(error));
    }
  };

  const handleStopInstance = async (pid: number) => {
    try {
      await launchService.stopGame(pid);
      showToast("success", t("launch.gameStopped"));
    } catch (error) {
      showToast("error", String(error));
    }
  };

  const handleImportPack = async () => {
    if (!pendingPack || importing) return;
    setImporting(true);
    setImportProgress({ stage: "prepare", current: 0, total: 1, message: "" });
    try {
      const result = await versionService.importModpack(pendingPack, importFormat);
      const versions = await versionService.getInstalledVersions();
      setInstalledVersions(versions);
      setTargetVersion(result.version_id);
      localStorage.setItem("lanyou.last_selected_version", result.version_id);
      setPendingPack(null);
      if (result.mods_failed > 0) {
        showToast(
          "info",
          t("modpack.importPartial", {
            name: result.name,
            failed: String(result.mods_failed),
          }),
        );
      } else {
        showToast("success", t("modpack.importSuccess", { name: result.name }));
      }
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const progressPercent =
    launchProgress.total > 0
      ? Math.round((launchProgress.step / launchProgress.total) * 100)
      : 0;

  const importPercent =
    importProgress && importProgress.total > 0
      ? Math.round((importProgress.current / importProgress.total) * 100)
      : 0;

  const resolutionOptions = [
    ...RESOLUTION_PRESETS.map((preset) => ({
      value: preset.value,
      label: `${preset.width} × ${preset.height}`,
    })),    { value: "custom", label: t("more.customResolution") },
  ];

  const importFormats: {
    value: ModpackFormat;
    title: string;
    description: string;
    recommended?: boolean;
  }[] = [
    {
      value: "auto",
      title: t("modpack.formatAuto"),
      description: t("modpack.formatAutoDesc"),
      recommended: true,
    },
    {
      value: "curseforge",
      title: t("modpack.formatCurseForge"),
      description: t("modpack.formatCurseForgeDesc"),
    },
    {
      value: "modrinth",
      title: t("modpack.formatModrinth"),
      description: t("modpack.formatModrinthDesc"),
    },
    {
      value: "lanyou",
      title: t("modpack.formatLanyou"),
      description: t("modpack.formatLanyouDesc"),
    },
  ];

  const memoryMax = Math.max(systemInfo?.total_memory_mb ?? 8192, 8192);
  const resolution = resolveResolution();
  const modsToShow = recommendedMods.length > 0 ? recommendedMods : fallbackMods;

  const accountModeLabel = activeAccount
    ? activeAccount.account_type === "Microsoft"
      ? t("account.microsoft")
      : activeAccount.account_type === "ThirdParty"
        ? t("account.thirdParty")
        : t("account.offline")
    : t("home.noAccount");

  const versionMeta = selectedVersion
    ? [
        selectedVersion.loader
          ? t(`version.${selectedVersion.loader.toLowerCase()}`)
          : t(`version.${selectedVersion.version_type.toLowerCase()}`),
        selectedVersion.install_time
          ? new Date(selectedVersion.install_time).toLocaleDateString(language)
          : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : t("home.readyToPlay");

  return (
    <PageTransition>
      {/* 内容区高度 = 窗口高度 - 标题栏 44px - 底部导航 56px，保证启动面板贴着底部导航 */}
      <div className="flex min-h-[calc(100vh-100px)] flex-col">
        <div className="launcher-enter mx-auto flex w-full max-w-[620px] flex-1 flex-col justify-end px-4 pb-14 pt-6">
          <p className="wallpaper-text-mid mb-3 text-[22px] font-semibold leading-snug tracking-tight">
            {greeting}
          </p>

          <section className="ui-panel overflow-hidden rounded-[12px]">
            <div className="flex items-center gap-1.5 p-2">
              <button
                type="button"
                onClick={() => setVersionModalOpen(true)}
                className="flex-1 min-w-0 h-11 px-2 flex items-center gap-2.5 rounded-[8px] hover:bg-surface-hover/70 transition-colors"
              >
                <VersionIcon version={selectedVersion} size={24} />
                <span className="flex-1 min-w-0 text-left">
                  <span className="block truncate text-[13.5px] font-semibold leading-tight text-on-surface">
                    {selectedVersion ? selectedVersion.id : t("home.versionNotSelected")}
                  </span>
                  <span className="block truncate text-[10.5px] leading-tight text-on-surface-subtle mt-0.5">
                    {versionMeta}
                  </span>
                </span>
                <ChevronDown size={15} className="shrink-0 text-on-surface-subtle" />
              </button>

              <button
                type="button"
                onClick={() => navigate("/accounts")}
                title={`${activeAccount?.username ?? t("account.addAccount")} · ${accountModeLabel}`}
                className="shrink-0 max-w-[128px] h-9 pl-1 pr-2 flex items-center gap-1.5 rounded-[7px] hover:bg-surface-hover/70 transition-colors"
              >
                <SkinAvatar account={activeAccount} size={22} rounded="none" />
                <span className="min-w-0 truncate text-[11.5px] font-medium text-on-surface">
                  {activeAccount?.username ?? t("account.addAccount")}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setOptionsOpen(true)}
                title={String(t("more.launchOptions"))}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-[7px] text-on-surface hover:bg-surface-hover/70 transition-colors"
              >
                <SlidersHorizontal size={16} />
              </button>

              <button
                type="button"
                onClick={handleOpenGameDir}
                title={String(t("more.openGameDir"))}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-[7px] text-on-surface hover:bg-surface-hover/70 transition-colors"
              >
                <FolderOpen size={16} />
              </button>

              {isRunning && runningInstances[0] && (
                <button
                  type="button"
                  onClick={() => handleStopInstance(runningInstances[0].pid)}
                  className="shrink-0 h-9 px-2.5 flex items-center gap-1.5 rounded-[7px] text-[11px] text-danger hover:bg-danger-container transition-colors"
                >
                  <Square size={11} />
                  <span className="whitespace-nowrap">{t("launch.stop")}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleLaunch}
                disabled={isLaunching}
                className="shrink-0 h-10 px-4 flex items-center justify-center gap-1.5 rounded-[8px] bg-primary
                  text-white text-[12.5px] font-semibold hover:opacity-90 disabled:opacity-60
                  disabled:pointer-events-none transition-opacity"
              >
                {isLaunching ? (
                  <span className="tabular-nums">{progressPercent}%</span>
                ) : (
                  <Play size={13} fill="currentColor" />
                )}
                <span className="whitespace-nowrap">
                  {isLaunching ? t("launch.launching") : t("home.launchGame")}
                </span>
              </button>
            </div>

            {isLaunching && (
              <div className="bg-surface-container/60 px-3 py-2">
                <div className="h-[2px] w-full rounded-[1px] bg-surface-low overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-on-surface-subtle">
                  <span className="flex-1 min-w-0 truncate">
                    {launchProgress.label || t("launch.launching")}
                  </span>
                  <span className="shrink-0 tabular-nums">{progressPercent}%</span>
                </div>
              </div>
            )}
          </section>

          <p className="wallpaper-text-low mt-2 flex items-center gap-1 px-0.5 text-[10.5px]">
            <FileArchive size={11} className="shrink-0" />
            <span className="truncate">{t("modpack.dragHint")}</span>
          </p>

          {crashCategory && (
            <section className="mt-4 rounded-[8px] border border-danger-border bg-danger-container px-3 py-2.5 flex items-start gap-2.5">
              <AlertTriangle size={15} className="shrink-0 mt-0.5 text-danger" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-danger">
                  {t(`crash.${crashCategory}.title`)}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-on-surface-variant">
                  {t(`crash.${crashCategory}.advice`)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCrashCategory(null)}
                className="shrink-0 w-5 h-5 flex items-center justify-center rounded-[4px] text-on-surface-subtle hover:bg-surface-hover hover:text-on-surface transition-colors"
                title={String(t("common.close"))}
              >
                <X size={13} />
              </button>
            </section>
          )}

          {(isLaunching || isRunning || logs.length > 0) && (
            <section className="ui-panel mt-4 rounded-[10px] overflow-hidden">
              <div className="h-9 px-3 flex items-center gap-2 bg-surface-container/60">
                <Terminal size={13} className="shrink-0 text-on-surface-subtle" />
                <span className="flex-1 min-w-0 truncate text-[11.5px] font-medium text-on-surface">
                  {t("home.gameLogs")}
                </span>
                {logs.length > 0 && (
                  <span className="shrink-0 text-[10.5px] tabular-nums text-on-surface-subtle">
                    {logs.length}
                  </span>
                )}
                <div className="shrink-0 flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={handleCopyLogs}
                    disabled={logs.length === 0}
                    title={String(t("home.copyLogs"))}
                    className="w-6 h-6 flex items-center justify-center rounded-[4px] text-on-surface-subtle hover:bg-surface-hover hover:text-on-surface disabled:opacity-40 transition-colors"
                  >
                    {copiedLogs ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                  </button>
                  <button
                    type="button"
                    onClick={clearLogs}
                    disabled={logs.length === 0}
                    title={String(t("home.clearLogs"))}
                    className="w-6 h-6 flex items-center justify-center rounded-[4px] text-on-surface-subtle hover:bg-surface-hover hover:text-on-surface disabled:opacity-40 transition-colors"
                  >
                    <X size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLogs((value) => !value)}
                    className="w-6 h-6 flex items-center justify-center rounded-[4px] text-on-surface-subtle hover:bg-surface-hover hover:text-on-surface transition-colors"
                  >
                    {showLogs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              {showLogs && (
                <div
                  ref={logsRef}
                  className="h-36 overflow-y-auto px-3 py-2 font-mono text-[10.5px] leading-[1.65]"
                >
                  {logs.length === 0 ? (
                    <p className="text-on-surface-subtle">
                      {isLaunching ? t("launch.launching") : t("common.noData")}
                    </p>
                  ) : (
                    logs.map((log, index) => (
                      <div
                        key={index}
                        className={`flex gap-2 break-all rounded-[4px] px-1 ${
                          log.level === "error"
                            ? "text-danger bg-danger/5"
                            : log.level === "warn"
                              ? "text-warning bg-warning/5"
                              : "text-on-surface-variant"
                        }`}
                      >
                        <span className="shrink-0 opacity-45 tabular-nums">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="min-w-0">{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </section>
          )}

          {modsToShow.length > 0 && !(showLogs && (isLaunching || isRunning || logs.length > 0)) && (
            <section className="mt-6">
              <div className="flex items-center gap-2 px-0.5">
                <h2 className="wallpaper-text-low text-[12.5px] font-semibold tracking-tight">
                  {t("home.modRecommendations")}
                </h2>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => navigate("/mods")}
                  className="shrink-0 inline-flex items-center gap-0.5 text-[11.5px] font-medium text-primary hover:opacity-80 transition-opacity"
                >
                  <span className="whitespace-nowrap">{t("home.modLoadMore")}</span>
                  <ArrowRight size={12} />
                </button>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                {modsToShow.map((mod) => (
                  <button
                    key={mod.key}
                    type="button"
                    title={`${mod.name} · ${mod.description}`}
                    onClick={() =>
                      navigate(`/mods/${mod.id}?source=${mod.source}`, {
                        state: mod.detail ? { mod: mod.detail } : undefined,
                      })
                    }
                    className="ui-panel ui-panel-hover min-w-0 flex items-center gap-2.5 p-2.5 rounded-[10px]
                      text-left"
                  >
                    {mod.iconUrl ? (
                      <img
                        src={mod.iconUrl}
                        alt={mod.name}
                        className="shrink-0 w-8 h-8 rounded-[8px] object-cover bg-surface-low"
                      />
                    ) : (
                      <span className="shrink-0 w-8 h-8 rounded-[8px] bg-primary/10 text-primary flex items-center justify-center">
                        {mod.icon === "book" ? <BookOpen size={16} /> : <Zap size={16} />}
                      </span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-[12px] font-medium text-on-surface">
                        {mod.name}
                      </span>
                      <span className="block truncate text-[10.5px] text-on-surface-variant mt-0.5">
                        {mod.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {installedVersions.length === 0 && (
            <section className="ui-panel mt-6 rounded-[10px] px-3 py-3 flex items-center gap-3">
              <span className="shrink-0 w-8 h-8 rounded-[7px] bg-surface-container/70 flex items-center justify-center">
                <VersionIcon size={18} />
              </span>
              <p className="flex-1 min-w-0 text-[11.5px] leading-relaxed text-on-surface-variant">
                {t("home.noVersion")}
              </p>
              <Button size="sm" className="shrink-0" onClick={() => navigate("/versions")}>
                {t("version.downloadPrompt")}
              </Button>
            </section>
          )}
        </div>

        <Modal
          open={versionModalOpen}
          onClose={() => setVersionModalOpen(false)}
          title={t("home.selectVersionTitle")}
          className="max-w-lg"
        >
          <div className="space-y-2 pb-1">
            {installedVersions.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-[13px] text-on-surface-variant">{t("home.noVersion")}</p>
                <Button
                  size="sm"
                  onClick={() => {
                    setVersionModalOpen(false);
                    navigate("/versions");
                  }}
                >
                  {t("version.downloadPrompt")}
                </Button>
              </div>
            ) : (
              installedVersions.map((version) => (
                <VersionCard
                  key={version.id}
                  version={version}
                  onClick={() => {
                    setTargetVersion(version.id);
                    setVersionModalOpen(false);
                  }}
                />
              ))
            )}
          </div>
        </Modal>

        <Modal
          open={optionsOpen}
          onClose={() => setOptionsOpen(false)}
          title={t("more.launchOptions")}
          className="max-w-md"
        >
          <div className="space-y-5">
            <p className="text-[11.5px] text-on-surface-subtle">{t("more.launchOptionsHint")}</p>

            <Slider
              label={t("launch.memory")}
              min={512}
              max={memoryMax}
              step={512}
              value={options.memory}
              onChange={(value) => setOptions({ ...options, memory: value })}
              formatValue={(value) => formatMemory(value)}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-on-surface-variant">
                {t("more.resolutionPreset")}
              </label>
              <Select
                options={resolutionOptions}
                value={options.resolution}
                onChange={(value) => setOptions({ ...options, resolution: value })}
              />
            </div>

            {options.resolution === "custom" && (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={t("launch.width")}
                  type="number"
                  min={320}
                  value={options.customWidth}
                  onChange={(event) =>
                    setOptions({ ...options, customWidth: Number(event.target.value) })
                  }
                />
                <Input
                  label={t("launch.height")}
                  type="number"
                  min={240}
                  value={options.customHeight}
                  onChange={(event) =>
                    setOptions({ ...options, customHeight: Number(event.target.value) })
                  }
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-on-surface-variant">
                {t("launch.jvmArgs")}
              </label>
              <Input
                value={options.jvmArgs}
                onChange={(event) => setOptions({ ...options, jvmArgs: event.target.value })}
                placeholder="-XX:+UseG1GC"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="text" onClick={() => setOptionsOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSaveOptions}>{t("common.save")}</Button>
            </div>
          </div>
        </Modal>

        <Modal
          open={pendingPack !== null}
          onClose={() => {
            if (!importing) setPendingPack(null);
          }}
          title={t("modpack.importTitle")}
          className="max-w-md"
        >
          <div className="space-y-3">
            <p className="text-[11px] text-on-surface-subtle break-all">{pendingPack}</p>

            <div className="space-y-1.5">
              {importFormats.map((option) => {
                const active = importFormat === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={importing}
                    onClick={() => setImportFormat(option.value)}
                    className={`w-full flex items-start gap-2.5 rounded-[8px] border px-3 py-2 text-left transition-colors
                      ${active ? "border-primary bg-primary/10" : "border-outline-variant hover:bg-surface-hover"}
                      disabled:opacity-60 disabled:pointer-events-none`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 w-3.5 h-3.5 rounded-full border flex items-center justify-center
                        ${active ? "border-primary bg-primary" : "border-outline"}`}
                    >
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[12.5px] font-medium text-on-surface">
                          {option.title}
                        </span>
                        {option.recommended && (
                          <span className="shrink-0 rounded-[4px] bg-primary/15 px-1.5 py-0.5 text-[9.5px] font-medium text-primary">
                            {t("modpack.recommended")}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[10.5px] leading-relaxed text-on-surface-variant">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {importing && (
              <div className="rounded-[8px] bg-surface-container/60 px-3 py-2">
                <div className="h-[2px] w-full rounded-[1px] bg-surface-low overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${importPercent}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-on-surface-subtle">
                  <span className="flex-1 min-w-0 truncate">
                    {t(
                      `modpack.stage.${importProgress?.stage ?? "prepare"}`,
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {importProgress && importProgress.total > 1
                      ? t("modpack.progressCount", {
                          current: String(importProgress.current),
                          total: String(importProgress.total),
                        })
                      : `${importPercent}%`}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outlined"
                size="sm"
                onClick={() => setPendingPack(null)}
                disabled={importing}
              >
                {t("common.cancel")}
              </Button>
              <Button size="sm" onClick={handleImportPack} loading={importing} disabled={importing}>
                {importing ? t("modpack.importing") : t("modpack.startImport")}
              </Button>
            </div>
          </div>
        </Modal>

        {dragActive &&
          createPortal(
            <div className="pointer-events-none fixed inset-0 z-[9998] flex items-center justify-center bg-scrim/60 backdrop-blur-[2px]">
              <div className="flex flex-col items-center gap-2 rounded-window border-2 border-dashed border-primary bg-surface-high/95 px-10 py-8 text-center shadow-dialog">
                <span className="w-11 h-11 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                  <Upload size={20} />
                </span>
                <p className="text-[14px] font-semibold text-on-surface">{t("modpack.dropTitle")}</p>
                <p className="text-[11.5px] text-on-surface-variant">{t("modpack.dropHint")}</p>
              </div>
            </div>,
            document.body,
          )}
      </div>
    </PageTransition>
  );
}
