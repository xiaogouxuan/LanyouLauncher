import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play,
  Terminal,
  ChevronDown,
  ChevronUp,
  X,
  User,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { PageTransition } from "@/components/common/PageTransition";
import { VersionCard } from "@/components/game/VersionCard";
import { useTranslation } from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { useVersionStore } from "@/stores/versionStore";
import { useLaunchStore } from "@/stores/launchStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToast } from "@/components/ui/Toast";
import { launchService } from "@/services/launchService";
import { settingsService, type SystemInfo } from "@/services/settingsService";
import { SkinAvatar } from "@/components/account/SkinAvatar";
import { formatMemory } from "@/utils/format";
import type { LaunchConfig } from "@/types/launch";

async function closeLauncher() {
  try {
    const { exit } = await import("@tauri-apps/plugin-process");
    await exit(0);
  } catch (error) {
    console.error("Failed to close launcher:", error);
    window.close();
  }
}

export default function Home() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const activeAccount = useAccountStore((s) => s.activeAccount);
  const installedVersions = useVersionStore((s) => s.installedVersions);
  const { settings } = useSettingsStore();
  const {
    isLaunching,
    isRunning,
    logs,
    launchProgress,
    setLaunchConfig,
    setIsLaunching,
    setIsRunning,
    appendLog,
    clearLogs,
    resetLaunchProgress,
  } = useLaunchStore();

  const logsRef = useRef<HTMLDivElement>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [targetVersion, setTargetVersion] = useState<string>("");
  const [selectedJava, setSelectedJava] = useState<string>("");
  const [selectedJavaVersion, setSelectedJavaVersion] = useState<string>("");
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [tipIndex, setTipIndex] = useState(0);

  const tips: string[] = (t("home.rotatingTips", { returnObjects: true }) as string[]) || [
    t("home.readyToPlay"),
  ];

  // 轮播文案
  useEffect(() => {
    if (tips.length <= 1) return;
    const timer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [tips.length]);

  // 读取上次选择的版本
  useEffect(() => {
    if (installedVersions.length === 0) return;
    const saved = localStorage.getItem("lanyou.last_selected_version");
    if (saved && installedVersions.some((v) => v.id === saved)) {
      setTargetVersion(saved);
    } else if (!targetVersion) {
      setTargetVersion(installedVersions[0].id);
    }
  }, [installedVersions, targetVersion]);

  // 获取系统信息（推荐内存）
  useEffect(() => {
    settingsService
      .getSystemInfo()
      .then((info) => setSystemInfo(info))
      .catch(() => {});
  }, []);

  // 根据选择的版本自动选择最合适的 Java
  useEffect(() => {
    if (!targetVersion) return;
    const javaPath = settings.java_paths[0] ?? "java";
    if (javaPath === "java" && settings.java_paths.length === 0) {
      setSelectedJava("java");
      setSelectedJavaVersion("");
      return;
    }
    settingsService
      .selectJavaForVersion(targetVersion)
      .then(([path, version]) => {
        setSelectedJava(path);
        setSelectedJavaVersion(version);
      })
      .catch(() => {
        setSelectedJava(javaPath);
        setSelectedJavaVersion("");
      });
  }, [targetVersion, settings.java_paths]);

  // 保存选择的版本
  useEffect(() => {
    if (targetVersion) {
      localStorage.setItem("lanyou.last_selected_version", targetVersion);
    }
  }, [targetVersion]);

  const selectedVersion = installedVersions.find((v) => v.id === targetVersion);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopyLogs = async () => {
    if (logs.length === 0) return;
    const text = logs
      .map((log) => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.message}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 2000);
    } catch (error) {
      showToast("error", t("home.copyLogsFailed"));
    }
  };

  const handleLaunch = async () => {
    if (!activeAccount) {
      showToast("error", t("home.selectAccount"));
      return;
    }
    if (!selectedVersion) {
      showToast("error", t("home.selectVersion"));
      return;
    }

    const javaPath = selectedJava || settings.java_paths[0] || "java";
    const memory = systemInfo?.recommended_memory_mb ?? settings.default_memory;

    const config: LaunchConfig = {
      version_id: selectedVersion.id,
      account_id: activeAccount.id,
      java_path: javaPath,
      memory_min: Math.max(512, Math.floor(memory * 0.25)),
      memory_max: memory,
      jvm_args: [],
      resolution_width: 854,
      resolution_height: 480,
      game_dir: selectedVersion.game_dir || settings.default_game_dir || null,
    };

    setLaunchConfig(config);
    setIsLaunching(true);
    resetLaunchProgress();
    clearLogs();
    setShowLogs(true);

    try {
      await launchService.startGame(config);
      setIsRunning(true);
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
      showToast("error", String(error));
    } finally {
      setIsLaunching(false);
    }
  };

  const progressPercent =
    launchProgress.total > 0
      ? Math.round((launchProgress.step / launchProgress.total) * 100)
      : 0;

  const accountModeLabel = activeAccount
    ? activeAccount.account_type === "Microsoft"
      ? t("account.microsoft")
      : t("account.offline")
    : t("home.noAccount");

  return (
    <PageTransition>
      <div className="relative h-full flex flex-col p-6 md:p-8">
        {/* 顶部：欢迎语 + 账号信息 */}
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl md:text-4xl font-bold text-on-surface tracking-tight">
              {t("home.welcome")}
              {activeAccount && (
                <span className="text-primary">, {activeAccount.username}</span>
              )}
            </h1>
            <p className="text-base md:text-lg text-on-surface-variant mt-2 min-h-[1.75rem] transition-opacity duration-500">
              {tips[tipIndex]}
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/accounts")}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface-container/85 border border-outline/20 hover:bg-surface-container-high transition-colors flex-shrink-0"
          >
            <SkinAvatar account={activeAccount || null} size={48} />
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-on-surface truncate max-w-[120px]">
                {activeAccount?.username || t("home.noAccount")}
              </p>
              <p className="text-xs text-on-surface-variant">{accountModeLabel}</p>
            </div>
          </button>
        </header>

        {/* 中间：留白展示壁纸 */}
        <div className="flex-1 min-h-0" />

        {/* 底部：版本选择 + 启动控制 */}
        <footer className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
          <div className="w-full md:w-auto space-y-3">
            {/* 版本选择 */}
            <div>
              <p className="text-xs text-on-surface-variant mb-1.5">{t("home.currentVersion")}</p>
              <button
                type="button"
                onClick={() => setVersionModalOpen(true)}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface-container/85 border border-outline/20 text-on-surface hover:bg-surface-container-high transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center flex-shrink-0">
                  <User size={20} className="text-on-primary-container" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium">
                    {selectedVersion ? selectedVersion.id : t("home.versionNotSelected")}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {selectedVersion && (
                      <Badge variant="success">
                        {t(`version.${selectedVersion.version_type.toLowerCase()}`)}
                      </Badge>
                    )}
                    {selectedVersion?.loader && (
                      <Badge>{t(`version.${selectedVersion.loader.toLowerCase()}`)}</Badge>
                    )}
                    {selectedJavaVersion && (
                      <Badge variant="info">{selectedJavaVersion}</Badge>
                    )}
                    {systemInfo && (
                      <Badge variant="default">
                        {formatMemory(systemInfo.recommended_memory_mb)}
                      </Badge>
                    )}
                  </div>
                </div>
                <ChevronDown size={18} className="text-on-surface-variant ml-2 flex-shrink-0" />
              </button>
            </div>

            {/* 日志折叠 */}
            {(isLaunching || isRunning || logs.length > 0) && (
              <div className="w-full md:min-w-[360px] md:max-w-md rounded-2xl bg-surface-container/85 border border-outline/20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowLogs((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <Terminal size={14} className="text-primary" />
                    <span className="text-xs font-medium text-on-surface">{t("home.gameLogs")}</span>
                    {logs.length > 0 && (
                      <Badge variant="default">{String(logs.length)}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyLogs();
                      }}
                      className="p-1 rounded-full text-on-surface-variant hover:bg-on-surface/[0.08]"
                      disabled={logs.length === 0}
                      title={t("home.copyLogs")}
                    >
                      {copiedLogs ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearLogs();
                      }}
                      className="p-1 rounded-full text-on-surface-variant hover:bg-on-surface/[0.08]"
                      disabled={logs.length === 0}
                    >
                      <X size={12} />
                    </button>
                    {showLogs ? (
                      <ChevronUp size={14} className="text-on-surface-variant" />
                    ) : (
                      <ChevronDown size={14} className="text-on-surface-variant" />
                    )}
                  </div>
                </button>

                {showLogs && (
                  <div
                    ref={logsRef}
                    className="h-36 overflow-y-auto px-4 pb-3 font-mono text-xs space-y-1"
                  >
                    {logs.length === 0 ? (
                      <p className="text-on-surface-variant text-center py-8">
                        {isLaunching ? t("launch.launching") : t("common.noData")}
                      </p>
                    ) : (
                      logs.map((log, index) => (
                        <div
                          key={index}
                          className={`break-all ${
                            log.level === "error"
                              ? "text-error"
                              : log.level === "warn"
                              ? "text-tertiary"
                              : "text-on-surface-variant"
                          }`}
                        >
                          <span className="opacity-60">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>{" "}
                          {log.message}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 启动进度 */}
            {(isLaunching || (isRunning && launchProgress.step > 0)) && (
              <div className="w-full md:min-w-[360px] md:max-w-md rounded-2xl bg-surface-container/85 border border-outline/20 p-4">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-on-surface-variant">{t("home.launchProgress")}</span>
                  <span className="text-primary font-medium">
                    {launchProgress.label || t("launch.launching")}
                  </span>
                </div>
                <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-on-surface-variant mt-1.5">
                  <span>
                    {launchProgress.step} / {launchProgress.total}
                  </span>
                  <span>{progressPercent}%</span>
                </div>
              </div>
            )}
          </div>

          {/* 启动按钮 */}
          <Button
            extendedFab
            className="w-full md:w-auto md:min-w-[180px]"
            onClick={handleLaunch}
            disabled={isLaunching || isRunning || !selectedVersion || !activeAccount}
          >
            <Play size={22} className="mr-2" fill="currentColor" />
            {isLaunching
              ? t("launch.launching")
              : isRunning
              ? t("launch.gameRunning")
              : t("home.launchGame")}
          </Button>
        </footer>

        <Modal
          open={versionModalOpen}
          onClose={() => setVersionModalOpen(false)}
          title={t("home.selectVersionTitle")}
        >
          <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
            {installedVersions.length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-6">{t("home.noVersion")}</p>
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
      </div>
    </PageTransition>
  );
}
