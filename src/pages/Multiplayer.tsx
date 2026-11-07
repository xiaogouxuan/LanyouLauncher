import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Copy,
  Crown,
  Download,
  Gamepad2,
  RefreshCw,
  Shuffle,
  Signal,
  Square,
  Network,
  Play,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { PageTransition } from "@/components/common/PageTransition";
import { MultiplayerTutorial } from "@/components/multiplayer/MultiplayerTutorial";
import { useTranslation } from "@/i18n";
import { easytierService } from "@/services/easytierService";
import { launchService } from "@/services/launchService";
import { useAccountStore } from "@/stores/accountStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVersionStore } from "@/stores/versionStore";
import type { EasytierStatus } from "@/types/easytier";
import type { LaunchConfig, LogEntry } from "@/types/launch";
import { formatError } from "@/utils/format";
import { parseI18nError } from "@/utils/i18nError";

/** 联机配置本地存储键 */
const STORAGE_KEY = "lanyou.easytier.config";
/** 图文教程是否已自动展示过 */
const TUTORIAL_KEY = "lanyou.multiplayer.tutorial.v1";
/** 密钥字符集，去掉容易混淆的 0/O/1/I */
const SECRET_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * 中转服务器：只使用蓝柚自有节点
 */
const SERVERS: { id: string; labelKey: string; descriptionKey: string; peers: string }[] = [
  {
    id: "guangzhou-bgp",
    labelKey: "multiplayer.serverGuangzhouBgp",
    descriptionKey: "multiplayer.serverGuangzhouBgpDesc",
    peers: "tcp://gz.easytier.aetrn.cn:11010",
  },
];

/** 联机表单：只保留小白需要关心的房间名称 */
interface MultiplayerForm {
  serverId: string;
  name: string;
  secret: string;
}

/** 生成随机连接密钥 */
function randomSecret(): string {
  let result = "";
  for (let index = 0; index < 8; index += 1) {
    result += SECRET_CHARS[Math.floor(Math.random() * SECRET_CHARS.length)];
  }
  return result;
}

/** 生成默认房间名称，例如「蓝友联机-4821」 */
function defaultRoomName(prefix: string): string {
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}

/** 创建一份全新的房间配置 */
function createForm(prefix: string): MultiplayerForm {
  return {
    serverId: SERVERS[0].id,
    name: defaultRoomName(prefix),
    secret: randomSecret(),
  };
}

/** 读取本地保存的房间配置 */
function readForm(prefix: string): MultiplayerForm {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MultiplayerForm>;
      const fallback = createForm(prefix);
      return {
        serverId: SERVERS.some((server) => server.id === parsed.serverId)
          ? (parsed.serverId as string)
          : fallback.serverId,
        name: parsed.name?.trim() ? parsed.name : fallback.name,
        secret: parsed.secret?.trim() ? parsed.secret : fallback.secret,
      };
    }
  } catch {
    // 本地配置损坏时回退到新房间
  }
  return createForm(prefix);
}

/** 保存房间配置 */
function persistForm(form: MultiplayerForm) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
  } catch {
    // 本地存储不可用时忽略保存失败
  }
}

/** 联机身份存储键 */
const ROLE_KEY = "lanyou.easytier.role";
/** 邀请码前缀与分隔符 */
const INVITE_PREFIX = "LANYOU";
const INVITE_SEPARATOR = "|";

/** 房主 / 客人身份 */
type Role = "host" | "guest";

/** 房间地址：虚拟 IP + 端口 */
interface RoomAddress {
  ip: string;
  port: string;
}

/** 端口只允许 10000-65535 */
function isValidPort(value: string): boolean {
  const port = Number(value);
  return Number.isInteger(port) && port >= 10000 && port <= 65535;
}

/** 生成完整邀请码：房间、密钥、地址、端口、中转服务器 */
function buildInvite(name: string, secret: string, serverId: string, address: RoomAddress): string {
  return [
    INVITE_PREFIX,
    name.trim(),
    secret.trim(),
    address.ip.trim(),
    address.port.trim(),
    serverId,
  ].join(INVITE_SEPARATOR);
}

/** 解析邀请码，兼容旧的「房间名#密钥」格式 */
function parseInvite(code: string): {
  name: string;
  secret: string;
  serverId: string;
  address: RoomAddress | null;
} | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith(`${INVITE_PREFIX}${INVITE_SEPARATOR}`)) {
    const separator = trimmed.lastIndexOf("#");
    if (separator <= 0) return null;
    const name = trimmed.slice(0, separator).trim();
    const secret = trimmed.slice(separator + 1).trim();
    if (!name || secret.length < 4) return null;
    return { name, secret, serverId: SERVERS[0].id, address: null };
  }

  const parts = trimmed.split(INVITE_SEPARATOR);
  if (parts.length < 3) return null;

  const name = parts[1]?.trim() ?? "";
  const secret = parts[2]?.trim() ?? "";
  if (!name || secret.length < 4) return null;

  const ip = parts[3]?.trim() ?? "";
  const port = parts[4]?.trim() ?? "";
  const address = ip && isValidPort(port) ? { ip, port } : null;
  const serverId = parts[5] ?? "";

  return {
    name,
    secret,
    serverId: SERVERS.some((server) => server.id === serverId) ? serverId : SERVERS[0].id,
    address,
  };
}

/** 格式化运行时长 */
function formatDuration(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

/** 格式化日志时间 */
function formatLogTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour12: false });
}

/**
 * 设置分区卡片
 */
function Section({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-outline-variant bg-surface-high overflow-hidden shadow-card">
      <div className="flex items-center gap-2.5 px-4 h-11 border-b border-outline-variant">
        <span className="w-5 h-5 rounded-[4px] bg-primary/10 text-primary flex items-center justify-center">
          {icon}
        </span>
        <h3 className="flex-1 text-[13px] font-semibold text-on-surface">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Multiplayer() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const activeAccount = useAccountStore((s) => s.activeAccount);
  const installedVersions = useVersionStore((s) => s.installedVersions);
  const { settings } = useSettingsStore();

  const [status, setStatus] = useState<EasytierStatus | null>(null);
  const [form, setForm] = useState<MultiplayerForm>(() =>
    readForm(t("multiplayer.defaultRoomName"))
  );
  const [role, setRole] = useState<Role>(() =>
    localStorage.getItem(ROLE_KEY) === "guest" ? "guest" : "host"
  );
  const [lanPort, setLanPort] = useState("");
  const [hostAddress, setHostAddress] = useState<RoomAddress | null>(null);
  const [launching, setLaunching] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [latency, setLatency] = useState<{
    state: "testing" | "ok" | "error";
    ms?: number;
  }>({ state: "testing" });
  const [showLogs, setShowLogs] = useState(false);
  const [showTutorial, setShowTutorial] = useState(
    () => !localStorage.getItem(TUTORIAL_KEY)
  );
  const [now, setNow] = useState(() => Date.now());
  const logRef = useRef<HTMLDivElement>(null);

  /** 一键进服使用最近选择的版本 */
  const selectedVersion = useMemo(() => {
    const saved = localStorage.getItem("lanyou.last_selected_version");
    return installedVersions.find((version) => version.id === saved) ?? installedVersions[0] ?? null;
  }, [installedVersions]);

  const running = status?.running ?? false;
  const loaded = status !== null;
  const installed = status?.installed ?? false;
  const logs = status?.logs ?? [];
  const busy = starting || installing || stopping;
  const myIp = status?.detected_ip ?? "";
  const hostIp = role === "host" ? myIp : hostAddress?.ip ?? "";
  const activePort = role === "host" ? lanPort.trim() : hostAddress?.port ?? "";
  const addressReady = Boolean(hostIp && isValidPort(activePort));
  const roomAddress = addressReady ? `${hostIp}:${activePort}` : "";
  const inviteCode =
    role === "host" && running && addressReady
      ? buildInvite(form.name, form.secret, form.serverId, { ip: hostIp, port: activePort })
      : "";
  const launchedIntoRoom = role === "guest" && addressReady;

  useEffect(() => {
    localStorage.setItem(ROLE_KEY, role);
  }, [role]);

  useEffect(() => {
    if (showTutorial) localStorage.setItem(TUTORIAL_KEY, "1");
  }, [showTutorial]);

  /**
   * 刷新联机状态
   */
  const refresh = useCallback(async () => {
    try {
      setStatus(await easytierService.getStatus());
    } catch {
      // 轮询失败时保持上一次状态
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    persistForm(form);
  }, [form]);

  /**
   * 用本机到中转服务器的 TCP 握手时间作为延迟参考
   */
  const measureLatency = useCallback(async () => {
    const server = SERVERS.find((item) => item.id === form.serverId) ?? SERVERS[0];
    setLatency({ state: "testing" });
    try {
      const ms = await easytierService.pingServer(server.peers);
      setLatency({ state: "ok", ms });
    } catch {
      setLatency({ state: "error" });
    }
  }, [form.serverId]);

  useEffect(() => {
    void measureLatency();
    const timer = setInterval(() => void measureLatency(), 30000);
    return () => clearInterval(timer);
  }, [measureLatency]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void listen<number>("easytier_install_progress", (event) => {
      setInstallProgress(Math.min(100, Math.max(0, event.payload)));
    })
      .then((dispose) => {
        if (disposed) {
          dispose();
        } else {
          unlisten = dispose;
        }
      })
      .catch(() => {
        // 核心组件下载进度不可用时不影响安装流程
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs.length, showLogs]);

  /**
   * 房主在游戏里「对局域网开放」后，自动从游戏日志识别端口并填入，
   * 免去小白手动找端口号
   */
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void listen<LogEntry>("launch-log", (event) => {
      if (role !== "host") return;

      const message = event.payload.message;
      const match = /(?:hosted on port|started serving on|server running on port)\s+(\d{4,6})/i.exec(
        message
      );
      const detected = match?.[1] ?? "";
      if (isValidPort(detected)) {
        setLanPort(detected);
        showToast("success", t("multiplayer.portDetected", { port: detected }));
      }
    })
      .then((dispose) => {
        if (disposed) {
          dispose();
        } else {
          unlisten = dispose;
        }
      })
      .catch(() => {
        // 监听失败时不影响手动填写端口
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [role, showToast, t]);

  /**
   * 复制文本到剪贴板
   */
  const copyText = async (text: string, successKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("success", t(successKey));
    } catch {
      showToast("error", t("multiplayer.copyFailed"));
    }
  };

  /**
   * 下载核心组件，成功返回 true
   */
  const installCore = async (): Promise<boolean> => {
    setInstalling(true);
    setInstallProgress(0);
    try {
      const info = await easytierService.install();
      setStatus((previous) =>
        previous ? { ...previous, installed: info.installed, version: info.version } : previous
      );
      showToast("success", t("multiplayer.coreInstalled"));
      await refresh();
      return true;
    } catch (error) {
      showToast("error", parseI18nError(error));
      return false;
    } finally {
      setInstalling(false);
    }
  };

  /**
   * 使用指定房间配置启动联机
   */
  const startWith = async (target: MultiplayerForm) => {
    setStarting(true);
    try {
      if (!installed) {
        const ready = await installCore();
        if (!ready) {
          return;
        }
      }

      const server = SERVERS.find((item) => item.id === target.serverId) ?? SERVERS[0];
      const next = await easytierService.start({
        network_name: target.name.trim(),
        network_secret: target.secret.trim(),
        peers: [server.peers],
        virtual_ip: "",
      });
      setStatus(next);
      showToast("success", t("multiplayer.started"));
    } catch (error) {
      showToast("error", parseI18nError(error));
    } finally {
      setStarting(false);
    }
  };

  /**
   * 房主一键开房：必须先填写局域网端口，否则不允许启动联机
   */
  const handleStart = () => {
    if (!isValidPort(lanPort)) {
      showToast("error", t("multiplayer.portRequired"));
      return;
    }
    const name = form.name.replace(/[|\r\n]/g, "").trim() || defaultRoomName(t("multiplayer.defaultRoomName"));
    setForm((previous) => ({ ...previous, name }));
    setRole("host");
    void startWith({ ...form, name });
  };

  /**
   * 客人通过邀请码加入房间：邀请码里必须带房主的地址和端口
   */
  const handleJoin = () => {
    const parsed = parseInvite(joinCode);
    if (!parsed) {
      showToast("error", t("multiplayer.joinInvalid"));
      return;
    }
    if (!parsed.address) {
      showToast("error", t("multiplayer.joinMissingAddress"));
      return;
    }

    const next = { ...form, name: parsed.name, secret: parsed.secret, serverId: parsed.serverId };
    setRole("guest");
    setForm(next);
    setHostAddress(parsed.address);
    setJoinCode("");
    void startWith(next);
    showToast("success", t("multiplayer.joined"));
  };

  /**
   * 从剪贴板粘贴邀请码
   */
  const handlePasteInvite = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setJoinCode(text.trim());
      }
    } catch {
      showToast("error", t("multiplayer.copyFailed"));
    }
  };

  /**
   * 一键启动游戏：客人带服务器地址直连，房主不带地址（进游戏后开放局域网）
   */
  const autoLaunchGame = async (serverAddress: string | null) => {
    if (!activeAccount) {
      showToast("error", t("multiplayer.enterNeedAccount"));
      navigate("/accounts");
      return;
    }
    if (!selectedVersion) {
      showToast("error", t("multiplayer.enterNeedVersion"));
      navigate("/versions");
      return;
    }

    const memory = settings.default_memory > 0 ? settings.default_memory : 2048;

    setLaunching(true);
    try {
      const config: LaunchConfig = {
        version_id: selectedVersion.id,
        account_id: activeAccount.id,
        java_path: settings.java_paths[0] || "java",
        memory_min: Math.max(512, Math.floor(memory * 0.25)),
        memory_max: memory,
        jvm_args: [],
        resolution_width: 854,
        resolution_height: 480,
        game_dir: selectedVersion.game_dir || settings.default_game_dir || null,
        server_address: serverAddress,
      };
      await launchService.startGame(config);
      showToast(
        "success",
        t(serverAddress ? "multiplayer.enterGameStarted" : "multiplayer.launchGameStarted")
      );
    } catch (error) {
      showToast("error", formatError(error));
    } finally {
      setLaunching(false);
    }
  };

  /**
   * 客人一键进入房主的游戏
   */
  const handleEnterGame = async () => {
    if (!roomAddress) {
      showToast("error", t("multiplayer.enterNeedAddress"));
      return;
    }
    await autoLaunchGame(roomAddress);
  };

  /**
   * 停止联机
   */
  const handleStop = async () => {
    setStopping(true);
    try {
      const next = await easytierService.stop();
      setStatus(next);
      showToast("success", t("multiplayer.stopped"));
    } catch (error) {
      showToast("error", parseI18nError(error));
    } finally {
      setStopping(false);
    }
  };

  /**
   * 清空联机日志
   */
  const handleClearLogs = async () => {
    try {
      await easytierService.clearLogs();
      await refresh();
    } catch (error) {
      showToast("error", parseI18nError(error));
    }
  };

  /**
   * 复制全部联机日志
   */
  const handleCopyLogs = async () => {
    const text = logs
      .map((entry) => `[${formatLogTime(entry.timestamp)}] ${entry.message}`)
      .join("\n");
    await copyText(text, "multiplayer.logsCopied");
  };

  const elapsed = running && status?.started_at ? now - status.started_at : 0;
  const virtualAddress = running
    ? status?.detected_ip ?? t("multiplayer.dhcpPending")
    : t("multiplayer.virtualIpAuto");

  const stats = [
    { label: t("multiplayer.statRoom"), value: form.name.trim() || t("multiplayer.notSet") },
    { label: t("multiplayer.statVirtualIp"), value: virtualAddress },
    {
      label: t("multiplayer.statDuration"),
      value: running ? formatDuration(elapsed) : "--:--:--",
    },
  ];

  const guideSteps = [
    {
      title: t("multiplayer.guideStep1Title"),
      description: t("multiplayer.guideStep1Desc"),
    },
    {
      title: t("multiplayer.guideStep2Title"),
      description: t("multiplayer.guideStep2Desc"),
    },
    {
      title: t("multiplayer.guideStep3Title"),
      description: t("multiplayer.guideStep3Desc"),
    },
  ];

  const selectedServer = SERVERS.find((server) => server.id === form.serverId) ?? SERVERS[0];
  const serverOptions = SERVERS.map((server) => ({
    value: server.id,
    label: t(server.labelKey),
    description: t(server.descriptionKey),
  }));

  const latencyMs = latency.ms ?? 0;
  const latencyTone =
    latency.state === "error"
      ? "text-error bg-error/8 border-error/25"
      : latency.state === "ok"
        ? latencyMs <= 80
          ? "text-primary bg-primary/8 border-primary/25"
          : latencyMs <= 180
            ? "text-warning bg-warning/8 border-warning/25"
            : "text-error bg-error/8 border-error/25"
        : "text-on-surface-subtle bg-surface-low border-outline-variant";
  const latencyText =
    latency.state === "testing"
      ? t("multiplayer.latencyTesting")
      : latency.state === "error"
        ? t("multiplayer.latencyFailed")
        : t("multiplayer.latencyMs", { ms: String(latencyMs) });

  return (
    <PageTransition>
      <div className="p-5 max-w-[860px] mx-auto space-y-3.5">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-outline-variant">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="wallpaper-text text-[18px] font-semibold tracking-tight">
                {t("multiplayer.title")}
              </h1>
              <span className="inline-flex items-center h-[18px] px-1.5 rounded-[3px] border border-outline-variant bg-surface-container text-[10px] text-on-surface-subtle">
                EasyTier
              </span>
            </div>
            <p className="text-[11.5px] text-on-surface-subtle mt-1">{t("multiplayer.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowTutorial(true)}
            className="shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-btn border border-outline-variant bg-surface-container text-[11px] font-medium text-on-surface-variant transition-colors hover:bg-surface-hover hover:text-on-surface"
          >
            <BookOpen size={13} />
            {t("multiplayer.tutorial.open")}
          </button>
        </div>

        <section className="rounded-card border border-outline-variant bg-surface-high shadow-card px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-on-surface-variant shrink-0">
              {t("multiplayer.roleTitle")}
            </span>
            <div className="flex-1" />
            <div className="flex shrink-0 rounded-btn border border-outline-variant overflow-hidden">
              <button
                type="button"
                disabled={running || busy}
                onClick={() => setRole("host")}
                className={`h-8 px-3 flex items-center gap-1.5 text-[12px] font-medium transition-colors duration-150
                  disabled:opacity-40 disabled:pointer-events-none
                  ${
                    role === "host"
                      ? "bg-primary text-on-primary"
                      : "bg-surface-high text-on-surface-subtle hover:bg-surface-hover"
                  }`}
              >
                <Crown size={13} className={role === "host" ? undefined : "text-primary"} />
                {t("multiplayer.roleHost")}
              </button>
              <button
                type="button"
                disabled={running || busy}
                onClick={() => setRole("guest")}
                className={`h-8 px-3 flex items-center gap-1.5 text-[12px] font-medium transition-colors duration-150
                  disabled:opacity-40 disabled:pointer-events-none
                  ${
                    role === "guest"
                      ? "bg-primary text-on-primary"
                      : "bg-surface-high text-on-surface-subtle hover:bg-surface-hover"
                  }`}
              >
                <UserPlus size={13} className={role === "guest" ? undefined : "text-primary"} />
                {t("multiplayer.roleGuest")}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-card border border-outline-variant bg-surface-high shadow-card overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-4">
            <span
              className={`shrink-0 w-11 h-11 rounded-[9px] border flex items-center justify-center
                ${
                  running
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-primary/8 border-primary/25 text-primary"
                }`}
            >
              <Network size={20} />
            </span>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    running ? "bg-primary" : "bg-on-surface-subtle/60"
                  }`}
                />
                <p className="text-[13.5px] font-semibold text-on-surface">
                  {running
                    ? t("multiplayer.statusRunning")
                    : starting || installing
                      ? t("multiplayer.statusStarting")
                      : t("multiplayer.statusIdle")}
                </p>
                {running && status?.pid && (
                  <span className="text-[10px] text-on-surface-subtle tabular-nums">
                    {t("multiplayer.pidLabel", { pid: String(status.pid) })}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-on-surface-subtle mt-0.5 truncate">
                {running
                  ? t("multiplayer.statusRunningDesc")
                  : role === "guest"
                    ? t("multiplayer.statusGuestIdleDesc")
                    : t("multiplayer.statusIdleDesc")}
              </p>
            </div>

            {running ? (
              <div className="flex items-center gap-1.5 shrink-0">
                {role === "host" && (
                  <Button
                    variant="tonal"
                    loading={launching}
                    onClick={() => void autoLaunchGame(null)}
                    className="shrink-0"
                  >
                    <Gamepad2 size={13} />
                    {launching ? t("multiplayer.launchingGame") : t("multiplayer.launchGame")}
                  </Button>
                )}
                <Button
                  variant="outlined"
                  onClick={() => void handleStop()}
                  loading={stopping}
                  className="shrink-0"
                >
                  <Square size={13} />
                  {t("multiplayer.stop")}
                </Button>
              </div>
            ) : role === "host" ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="tonal"
                  loading={launching}
                  onClick={() => void autoLaunchGame(null)}
                  className="shrink-0"
                >
                  <Gamepad2 size={13} />
                  {launching ? t("multiplayer.launchingGame") : t("multiplayer.launchGame")}
                </Button>
                <Button
                  onClick={handleStart}
                  loading={starting || installing}
                  disabled={!loaded}
                  className="shrink-0 !h-10 !px-5 text-[13.5px]"
                >
                  <Play size={15} />
                  {t("multiplayer.startRoom")}
                </Button>
              </div>
            ) : null}
          </div>

          {running && (
            <>
              <div className="flex items-center gap-2 px-4 py-2.5 border-t border-outline-variant bg-surface-low">
                <span className="text-[10.5px] text-on-surface-subtle shrink-0">
                  {t("multiplayer.roomAddress")}
                </span>
                <span className="flex-1 min-w-0 truncate font-mono text-[12px] text-on-surface">
                  {roomAddress || t("multiplayer.roomAddressPending")}
                </span>
                <Button
                  variant="tonal"
                  size="sm"
                  disabled={!addressReady}
                  onClick={() => void copyText(roomAddress, "multiplayer.addressCopied")}
                  className="shrink-0"
                >
                  <Copy size={12} />
                  {t("multiplayer.copyAddress")}
                </Button>
                {launchedIntoRoom && (
                  <Button
                    size="sm"
                    loading={launching}
                    onClick={() => void handleEnterGame()}
                    className="shrink-0"
                  >
                    <Gamepad2 size={13} />
                    {launching ? t("multiplayer.enteringGame") : t("multiplayer.enterGame")}
                  </Button>
                )}
              </div>

              {role === "host" && (
                <div className="flex items-center gap-2 px-4 py-2.5 border-t border-outline-variant">
                  <span className="text-[10.5px] text-on-surface-subtle shrink-0">
                    {t("multiplayer.inviteCode")}
                  </span>
                  <span className="flex-1 min-w-0 truncate font-mono text-[12px] text-on-surface">
                    {inviteCode || t("multiplayer.inviteIncomplete")}
                  </span>
                  <Button
                    variant="tonal"
                    size="sm"
                    disabled={!inviteCode}
                    onClick={() => void copyText(inviteCode, "multiplayer.inviteCopied")}
                    className="shrink-0"
                  >
                    <Copy size={12} />
                    {t("multiplayer.copyInvite")}
                  </Button>
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-3 gap-px bg-outline-variant border-t border-outline-variant">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-surface-high px-4 py-2.5 min-w-0">
                <p className="text-[10px] text-on-surface-subtle">{stat.label}</p>
                <p className="text-[12px] font-medium text-on-surface truncate mt-0.5 tabular-nums">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {role === "guest" && (
          <Section icon={<UserPlus size={15} />} title={t("multiplayer.joinTitle")}>
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5">
                <Input
                  className="flex-1"
                  placeholder={t("multiplayer.joinPlaceholder")}
                  value={joinCode}
                  disabled={running}
                  onChange={(event) => setJoinCode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleJoin();
                    }
                  }}
                />
                <Button
                  variant="outlined"
                  disabled={running}
                  onClick={() => void handlePasteInvite()}
                  className="shrink-0"
                >
                  <Copy size={12} />
                  {t("multiplayer.paste")}
                </Button>
                <Button
                  variant="tonal"
                  disabled={running || !joinCode.trim()}
                  onClick={handleJoin}
                  className="shrink-0"
                >
                  {t("multiplayer.join")}
                </Button>
              </div>
              <p className="text-[10.5px] text-on-surface-subtle mt-1.5 px-0.5">
                {t("multiplayer.joinHint")}
              </p>
            </div>
          </Section>
        )}

        <Section icon={<BookOpen size={15} />} title={t("multiplayer.guideTitle")}>
          <div className="px-4 py-3.5 space-y-2.5">
            {guideSteps.map((step, index) => (
              <div key={step.title} className="flex gap-2.5">
                <span
                  className="shrink-0 w-5 h-5 mt-0.5 rounded-full bg-primary/10 text-primary
                    text-[11px] font-semibold flex items-center justify-center"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-on-surface">{step.title}</p>
                  <p className="text-[11px] text-on-surface-subtle leading-relaxed mt-0.5">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
            <div className="pt-1">
              <Button
                variant="tonal"
                className="w-full"
                onClick={() => setShowTutorial(true)}
              >
                <BookOpen size={13} />
                {t("multiplayer.tutorial.open")}
              </Button>
            </div>
          </div>
        </Section>

        {loaded && !installed && (
          <section className="rounded-card border border-outline-variant bg-surface-high shadow-card px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="shrink-0 w-8 h-8 rounded-[6px] bg-primary/10 text-primary flex items-center justify-center">
                <Download size={15} />
              </span>
              <p className="flex-1 min-w-0 text-[11.5px] text-on-surface-subtle leading-relaxed">
                {t("multiplayer.coreNotInstalledDesc")}
              </p>
              <Button
                variant="tonal"
                size="sm"
                onClick={() => void installCore()}
                loading={installing}
                className="shrink-0"
              >
                <Download size={12} />
                {installing
                  ? `${t("multiplayer.installingCore")} ${Math.round(installProgress)}%`
                  : t("multiplayer.installCore")}
              </Button>
            </div>
            {installing && (
              <div className="mt-2.5 h-[3px] rounded-full bg-surface-low overflow-hidden">
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{ width: `${installProgress}%` }}
                />
              </div>
            )}
          </section>
        )}

        {role === "host" && (
          <Section icon={<Network size={15} />} title={t("multiplayer.settingsTitle")}>
          <div className="px-4 py-3.5 space-y-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-on-surface-variant">
                {t("multiplayer.roomName")}
              </label>
              <div className="flex items-center gap-1.5">
                <Input
                  className="flex-1"
                  placeholder={t("multiplayer.roomNamePlaceholder")}
                  value={form.name}
                  maxLength={32}
                  disabled={running}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      name: event.target.value.replace(/[|\r\n]/g, ""),
                    }))
                  }
                />
                <button
                  type="button"
                  disabled={running}
                  title={t("multiplayer.randomName")}
                  onClick={() =>
                    setForm((previous) => ({
                      ...previous,
                      name: defaultRoomName(t("multiplayer.defaultRoomName")),
                    }))
                  }
                  className="shrink-0 w-8 h-8 rounded-btn border border-outline-variant bg-surface-high
                    text-on-surface-subtle hover:bg-surface-hover hover:text-on-surface
                    transition-colors duration-150 flex items-center justify-center
                    disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Shuffle size={14} />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-on-surface-variant">
                  {t("multiplayer.server")}
                </label>
                <button
                  type="button"
                  title={t("multiplayer.latencyRefresh")}
                  disabled={latency.state === "testing"}
                  onClick={() => void measureLatency()}
                  className={`inline-flex items-center gap-1 h-6 px-2 rounded-[4px] border
                    text-[10.5px] font-medium tabular-nums transition-colors duration-150
                    disabled:opacity-70 ${latencyTone}`}
                >
                  <Signal size={11} />
                  <span>{latencyText}</span>
                  <RefreshCw
                    size={10}
                    className={latency.state === "testing" ? "animate-spin" : ""}
                  />
                </button>
              </div>
              <Select
                options={serverOptions}
                value={form.serverId}
                disabled={running}
                onChange={(value) =>
                  setForm((previous) => ({ ...previous, serverId: value }))
                }
              />
              <p className="text-[10.5px] leading-relaxed text-on-surface-subtle">
                {t(selectedServer.descriptionKey)}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-on-surface-variant">
                {t("multiplayer.secret")}
              </label>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-8 px-2.5 rounded-input border border-outline-variant bg-surface-low flex items-center">
                  <span className="font-mono text-[13px] tracking-[0.12em] text-on-surface truncate">
                    {form.secret}
                  </span>
                </div>
                <button
                  type="button"
                  title={t("multiplayer.copySecret")}
                  onClick={() => void copyText(form.secret, "multiplayer.secretCopied")}
                  className="shrink-0 w-8 h-8 rounded-btn border border-outline-variant bg-surface-high
                    text-on-surface-subtle hover:bg-surface-hover hover:text-on-surface
                    transition-colors duration-150 flex items-center justify-center"
                >
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  disabled={running}
                  title={t("multiplayer.newSecret")}
                  onClick={() => setForm((previous) => ({ ...previous, secret: randomSecret() }))}
                  className="shrink-0 w-8 h-8 rounded-btn border border-outline-variant bg-surface-high
                    text-on-surface-subtle hover:bg-surface-hover hover:text-on-surface
                    transition-colors duration-150 flex items-center justify-center
                    disabled:opacity-40 disabled:pointer-events-none"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
              <p className="text-[10.5px] text-on-surface-subtle px-0.5">
                {t("multiplayer.secretHint")}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-on-surface-variant">
                {t("multiplayer.roomPort")}
              </label>
              <Input
                placeholder="10000-65535"
                value={lanPort}
                maxLength={5}
                disabled={running}
                onChange={(event) => setLanPort(event.target.value.replace(/\D/g, ""))}
              />
              <p className="text-[10.5px] text-on-surface-subtle px-0.5">
                {t("multiplayer.roomPortHint")}
              </p>
            </div>
          </div>
          </Section>
        )}

        <section className="rounded-card border border-outline-variant bg-surface-high shadow-card overflow-hidden">
          <button
            type="button"
            onClick={() => setShowLogs((value) => !value)}
            className="w-full flex items-center gap-2.5 px-4 h-11 text-left hover:bg-surface-hover transition-colors duration-150"
          >
            <span className="w-5 h-5 rounded-[4px] bg-primary/10 text-primary flex items-center justify-center">
              <Network size={13} />
            </span>
            <span className="flex-1 text-[13px] font-semibold text-on-surface">
              {t("multiplayer.logsTitle")}
            </span>
            <span className="text-[10px] text-on-surface-subtle tabular-nums">{logs.length}</span>
            {showLogs ? (
              <ChevronUp size={14} className="text-on-surface-subtle" />
            ) : (
              <ChevronDown size={14} className="text-on-surface-subtle" />
            )}
          </button>

          {showLogs && (
            <>
              <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-t border-outline-variant">
                <button
                  type="button"
                  onClick={() => void handleCopyLogs()}
                  disabled={logs.length === 0}
                  title={t("home.copyLogs")}
                  className="w-7 h-7 rounded-btn text-on-surface-subtle hover:bg-surface-hover
                    hover:text-on-surface transition-colors duration-150 flex items-center justify-center
                    disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Copy size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => void handleClearLogs()}
                  disabled={logs.length === 0}
                  title={t("home.clearLogs")}
                  className="w-7 h-7 rounded-btn text-on-surface-subtle hover:bg-danger-container
                    hover:text-danger transition-colors duration-150 flex items-center justify-center
                    disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div
                ref={logRef}
                className="h-40 overflow-y-auto px-4 py-2.5 bg-surface-low font-mono text-[11px] leading-relaxed border-t border-outline-variant"
              >
                {logs.length === 0 ? (
                  <p className="text-on-surface-subtle">{t("multiplayer.logsEmpty")}</p>
                ) : (
                  logs.map((entry, index) => (
                    <div key={`${entry.timestamp}-${index}`} className="flex gap-2">
                      <span className="shrink-0 text-on-surface-subtle tabular-nums">
                        {formatLogTime(entry.timestamp)}
                      </span>
                      <span
                        className={`break-all ${
                          entry.level === "error"
                            ? "text-danger"
                            : entry.level === "warn"
                              ? "text-warning"
                              : "text-on-surface-variant"
                        }`}
                      >
                        {entry.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </div>
      <MultiplayerTutorial
        open={showTutorial}
        onClose={() => setShowTutorial(false)}
        initialRole={role}
      />
    </PageTransition>
  );
}

export default Multiplayer;
