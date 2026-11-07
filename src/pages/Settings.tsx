import { useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Globe,
  Palette,
  Download,
  Coffee,
  Cpu,
  Shield,
  Info,
  Image,
  X,
  ArrowUpRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { PageTransition } from "@/components/common/PageTransition";
import { useTranslation } from "@/i18n";
import { useUIStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToast } from "@/components/ui/Toast";
import { APP_NAME, APP_VERSION, GITHUB_REPO, BILIBILI_URL, CONTACT_EMAIL } from "@/utils/constants";
import { formatMemory } from "@/utils/format";
import { settingsService, type SystemInfo } from "@/services/settingsService";
import { updateService } from "@/services/updateService";
import type { ThemeMode, DownloadSource } from "@/types/settings";
import { BUILTIN_WALLPAPERS, accessibleAccent } from "@/lib/wallpaperTheme";

const THEME_COLORS = ["#2F6BFF", "#6D5CE7", "#1A9BC4", "#20A66E", "#D98E20", "#DB5282"];

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-outline-variant bg-surface-high overflow-hidden shadow-card">
      <div className="flex items-center gap-2.5 px-4 h-11 border-b border-outline-variant">
        <span className="w-5 h-5 rounded-[4px] bg-primary/10 text-primary flex items-center justify-center">
          {icon}
        </span>
        <h3 className="text-[13px] font-semibold text-on-surface">{title}</h3>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-outline-variant last:border-b-0">
      <div className="min-w-0">
        <p className="text-[13px] text-on-surface">{label}</p>
        {description && <p className="text-[11px] text-on-surface-subtle mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { theme, setTheme, language, setLanguage } = useUIStore();
  const { settings, updateSetting, setSettings } = useSettingsStore();

  const languageOptions = [
    { value: "zh-CN", label: t("settings.langZhCN") },
    { value: "en-US", label: t("settings.langEnUS") },
  ];

  const themeOptions = [
    { value: "light", label: t("settings.themeLight") },
    { value: "dark", label: t("settings.themeDark") },
    { value: "system", label: t("settings.themeSystem") },
  ];

  const downloadSourceOptions = [
    { value: "official", label: t("settings.downloadOfficial") },
    { value: "bmclapi", label: t("settings.downloadMirror") },
  ];

  const handleOpenUrl = async (url: string) => {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      open(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  const [detectingJava, setDetectingJava] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [selectingBg, setSelectingBg] = useState(false);
  const [downloadingJava, setDownloadingJava] = useState<number | null>(null);
  const [detectedJava, setDetectedJava] = useState<[string, string][]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    settingsService
      .getSettings()
      .then((s) => {
        setSettings(s);
        setLanguage(s.language);
        setTheme(s.theme);
      })
      .catch(() => {});

    settingsService
      .getSystemInfo()
      .then((info) => setSystemInfo(info))
      .catch(() => {});
  }, [setSettings, setLanguage, setTheme]);

  useEffect(() => {
    settingsService.saveSettings(settings).catch(() => {});
  }, [settings]);

  const handleDetectJava = async () => {
    setDetectingJava(true);
    try {
      const detected = await settingsService.detectJava();
      setDetectedJava(detected);
      const paths = detected.map(([path]) => path);
      updateSetting("java_paths", paths);
      showToast("success", t("settings.javaDetected", { count: String(paths.length) }));
    } catch (error) {
      showToast("error", String(error));
    } finally {
      setDetectingJava(false);
    }
  };

  const handleDownloadJava = async (major: number) => {
    setDownloadingJava(major);
    try {
      const path = await settingsService.downloadJava(major);
      const paths = Array.from(new Set([...settings.java_paths, path]));
      updateSetting("java_paths", paths);
      const version = await settingsService.getJavaVersion(path).catch(() => "");
      setDetectedJava((prev) => Array.from(new Map([...prev, [path, version]])));
      showToast("success", t("settings.javaDownloadComplete", { major: String(major) }));
    } catch (error) {
      showToast("error", `${t("settings.javaDownloadFailed")}: ${String(error)}`);
    } finally {
      setDownloadingJava(null);
    }
  };

  const handleUseRecommendedMemory = () => {
    if (systemInfo) {
      updateSetting("default_memory", systemInfo.recommended_memory_mb);
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const release = await updateService.checkUpdate();
      if (release) {
        showToast("info", t("settings.newVersionFound", { version: release.tag_name }));
      } else {
        showToast("success", t("update.noUpdate"));
      }
    } catch (error) {
      showToast("error", String(error));
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleSelectBackground = async () => {
    setSelectingBg(true);
    try {
      const path = await settingsService.selectBackgroundImage();
      if (path) {
        updateSetting("wallpaper", "");
        updateSetting("background_image", path);
        showToast("success", t("settings.backgroundSet"));
      }
    } catch (error) {
      showToast("error", String(error));
    } finally {
      setSelectingBg(false);
    }
  };

  const handleSelectSolidWallpaper = (color: string) => {
    updateSetting("background_image", "");
    updateSetting("wallpaper", `solid:${color}`);
    updateSetting("theme_color", accessibleAccent(color));
    showToast("success", t("settings.backgroundSet"));
  };

  const handleClearBackground = () => {
    updateSetting("background_image", "");
    showToast("success", t("settings.backgroundCleared"));
  };

  const javaList =
    detectedJava.length > 0
      ? detectedJava
      : settings.java_paths.map((path) => [path, ""] as [string, string]);

  const wallpaperActive = "border-primary ring-1 ring-primary";
  const wallpaperIdle = "border-outline-variant hover:border-outline";

  return (
    <PageTransition>
      <div className="p-5 max-w-[860px] mx-auto space-y-3.5">
        <div className="pb-3 border-b border-outline-variant">
          <h1 className="wallpaper-text text-[18px] font-semibold tracking-tight">{t("settings.title")}</h1>
        </div>

        <Section icon={<Globe size={15} />} title={t("settings.general")}>
          <Row label={t("settings.language")}>
            <Select
              className="w-[150px]"
              options={languageOptions}
              value={language}
              onChange={(v) => {
                setLanguage(v);
                updateSetting("language", v);
              }}
            />
          </Row>
          <Row label={t("settings.theme")}>
            <Select
              className="w-[150px]"
              options={themeOptions}
              value={theme}
              onChange={(v) => {
                setTheme(v as ThemeMode);
                updateSetting("theme", v as ThemeMode);
              }}
            />
          </Row>
          <Row label={t("settings.closeAfterLaunch")}>
            <Switch
              checked={settings.close_after_launch}
              onChange={(v) => updateSetting("close_after_launch", v)}
            />
          </Row>
        </Section>

        <Section icon={<Palette size={15} />} title={t("settings.appearance")}>
          <Row label={t("settings.themeColor")}>
            <div className="flex items-center gap-1.5">
              {THEME_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => updateSetting("theme_color", color)}
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-105 ${
                    settings.theme_color.toLowerCase() === color.toLowerCase()
                      ? "ring-1 ring-primary"
                      : ""
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={color}
                >
                  {settings.theme_color.toLowerCase() === color.toLowerCase() && (
                    <Check size={12} className="text-white" />
                  )}
                </button>
              ))}
              <input
                type="color"
                value={settings.theme_color}
                onChange={(e) => updateSetting("theme_color", e.target.value)}
                className="w-6 h-6 rounded-full border border-outline-variant bg-transparent cursor-pointer overflow-hidden"
                title={t("settings.themeColor")}
              />
            </div>
          </Row>

          <div className="px-4 py-3 border-b border-outline-variant">
            <p className="text-[13px] text-on-surface mb-2.5">{t("settings.wallpaper")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  updateSetting("wallpaper", "");
                  updateSetting("background_image", "");
                }}
                className={`h-[52px] w-[84px] rounded-btn border text-[11px] transition-colors ${
                  settings.wallpaper === "" && !settings.background_image
                    ? wallpaperActive
                    : wallpaperIdle
                } bg-surface-container text-on-surface-variant`}
              >
                {t("settings.wallpaperNone")}
              </button>
              {BUILTIN_WALLPAPERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    updateSetting("background_image", "");
                    updateSetting("wallpaper", item.id);
                    // 切壁纸时同步切换配套主题色，让整个界面与壁纸浑然一体
                    updateSetting("theme_color", item.themeColor);
                  }}
                  className={`relative h-[52px] w-[84px] rounded-btn border overflow-hidden transition-colors ${
                    settings.wallpaper === item.id ? wallpaperActive : wallpaperIdle
                  }`}
                >
                  <span
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(/img/${item.id}.jpg)` }}
                  />
                  <span
                    className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full border border-white/70 shadow-sm"
                    style={{ backgroundColor: item.themeColor }}
                  />
                  <span className="absolute inset-x-0 bottom-0 px-1.5 py-0.5 text-[10px] text-white bg-black/45 truncate text-left">
                    {t(item.nameKey)}
                  </span>
                </button>
              ))}
              <div
                className={`relative h-[52px] w-[84px] rounded-btn border overflow-hidden transition-colors ${
                  settings.wallpaper.startsWith("solid:") ? wallpaperActive : wallpaperIdle
                } bg-surface-container`}
              >
                <input
                  type="color"
                  value={
                    settings.wallpaper.startsWith("solid:")
                      ? settings.wallpaper.slice(6)
                      : settings.theme_color
                  }
                  onChange={(e) => handleSelectSolidWallpaper(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  title={t("settings.wallpaperSolid")}
                />
                <span
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundColor: settings.wallpaper.startsWith("solid:")
                      ? settings.wallpaper.slice(6)
                      : settings.theme_color,
                  }}
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 px-1.5 py-0.5 text-[10px] text-white bg-black/45 truncate text-left">
                  {t("settings.wallpaperSolid")}
                </span>
              </div>
            </div>
          </div>

          <Row label={t("settings.backgroundImage")}>
            <div className="flex items-center gap-2">
              {settings.background_image && (
                <div
                  className="w-9 h-9 rounded-btn bg-cover bg-center border border-outline-variant"
                  style={{ backgroundImage: `url("${convertFileSrc(settings.background_image)}")` }}
                  title={settings.background_image}
                />
              )}
              {settings.background_image && (
                <Button size="sm" variant="text" onClick={handleClearBackground} title={t("settings.clearBackground")}>
                  <X size={14} />
                </Button>
              )}
              <Button size="sm" variant="tonal" onClick={handleSelectBackground} loading={selectingBg}>
                <Image size={14} />
                {t("settings.selectBackground")}
              </Button>
            </div>
          </Row>

          <div className="px-4 py-3 border-b border-outline-variant">
            <Slider
              min={0.05}
              max={1}
              step={0.05}
              value={settings.background_opacity}
              onChange={(v) => updateSetting("background_opacity", v)}
              label={t("settings.backgroundOpacity")}
              formatValue={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
          <div className="px-4 py-3">
            <Slider
              min={0}
              max={32}
              step={1}
              value={settings.background_blur}
              onChange={(v) => updateSetting("background_blur", v)}
              label={t("settings.backgroundBlur")}
              formatValue={(v) => `${Math.round((v / 32) * 100)}%`}
            />
          </div>
        </Section>

        <Section icon={<Download size={15} />} title={t("settings.download")}>
          <Row label={t("settings.downloadSource")}>
            <Select
              className="w-[170px]"
              options={downloadSourceOptions}
              value={settings.download_source}
              onChange={(v) => updateSetting("download_source", v as DownloadSource)}
            />
          </Row>
        </Section>

        <Section icon={<Coffee size={15} />} title={t("settings.java")}>
          <div className="px-4 py-3 border-b border-outline-variant">
            <div className="flex items-center justify-between gap-4 mb-2">
              <p className="text-[13px] text-on-surface">{t("settings.javaPath")}</p>
              <Button size="sm" variant="tonal" onClick={handleDetectJava} loading={detectingJava}>
                {t("settings.autoDetect")}
              </Button>
            </div>
            {javaList.length === 0 ? (
              <p className="text-[11.5px] text-on-surface-subtle">{t("settings.noJavaFound")}</p>
            ) : (
              <div className="space-y-1.5">
                {javaList.map(([path, version], index) => (
                  <div key={`${path}-${index}`} className="flex items-center justify-between gap-3">
                    <p className="text-[11.5px] text-on-surface-variant truncate flex-1 font-mono" title={path}>
                      {path}
                    </p>
                    {version && (
                      <Badge variant="info" className="flex-shrink-0">
                        {version}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] text-on-surface">{t("settings.downloadJava", { major: "8 / 17 / 21" })}</p>
                <p className="text-[11px] text-on-surface-subtle mt-0.5">{t("settings.javaDownloadHint")}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {[8, 17, 21].map((major) => (
                  <Button
                    key={major}
                    size="sm"
                    variant="outlined"
                    onClick={() => handleDownloadJava(major)}
                    loading={downloadingJava === major}
                    disabled={downloadingJava !== null}
                  >
                    {downloadingJava === major
                      ? t("settings.downloadingJava", { major: String(major) })
                      : `${major}`}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section icon={<Cpu size={15} />} title={t("settings.memory")}>
          <div className="px-4 py-3 border-b border-outline-variant">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-on-surface-variant">{t("settings.currentMemory")}</span>
              <span className="text-on-surface font-medium tabular-nums">
                {formatMemory(settings.default_memory)}
              </span>
            </div>
            {systemInfo && (
              <div className="flex items-center justify-between text-[12px] mt-2">
                <span className="text-on-surface-variant">
                  {t("settings.recommendedMemory", {
                    total: formatMemory(systemInfo.total_memory_mb),
                  })}
                </span>
                <Button
                  size="sm"
                  variant="text"
                  onClick={handleUseRecommendedMemory}
                  disabled={settings.default_memory === systemInfo.recommended_memory_mb}
                >
                  {formatMemory(systemInfo.recommended_memory_mb)}
                </Button>
              </div>
            )}
          </div>
          <div className="px-4 py-3.5">
            <Slider
              min={512}
              max={Math.max(systemInfo?.total_memory_mb ?? 8192, 8192)}
              step={256}
              value={settings.default_memory}
              onChange={(v) => updateSetting("default_memory", v)}
              formatValue={formatMemory}
            />
          </div>
        </Section>

        <Section icon={<Shield size={15} />} title={t("settings.update")}>
          <Row label={t("settings.autoUpdate")}>
            <Switch
              checked={settings.auto_update}
              onChange={(v) => updateSetting("auto_update", v)}
            />
          </Row>
          <Row label={t("settings.checkUpdate")}>
            <Button size="sm" variant="tonal" onClick={handleCheckUpdate} loading={checkingUpdate}>
              {t("settings.checkUpdate")}
            </Button>
          </Row>
        </Section>

        <Section icon={<Info size={15} />} title={t("settings.about")}>
          <button
            type="button"
            onClick={() => handleOpenUrl(GITHUB_REPO)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-outline-variant hover:bg-surface-hover/50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-btn bg-primary/8 border border-primary/25 flex items-center justify-center flex-shrink-0 overflow-hidden">
                <img src="/logo.png" alt={APP_NAME} className="w-7 h-7 object-contain" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-on-surface">{APP_NAME}</p>
                <p className="text-[11px] text-on-surface-subtle mt-0.5">
                  {t("settings.version")} {APP_VERSION}
                </p>
              </div>
            </div>
            <ArrowUpRight size={15} className="text-on-surface-subtle flex-shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => handleOpenUrl(BILIBILI_URL)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-outline-variant hover:bg-surface-hover/50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-btn bg-primary/8 border border-primary/25 flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-semibold text-[11px] tracking-tight">1B2T</span>
              </div>
              <div>
                <p className="text-[13px] font-medium text-on-surface">{t("settings.developer")}</p>
                <p className="text-[11px] text-on-surface-subtle mt-0.5">{t("settings.bilibili")}</p>
              </div>
            </div>
            <ArrowUpRight size={15} className="text-on-surface-subtle flex-shrink-0" />
          </button>

          <div className="px-4 py-3 space-y-1.5">
            <p className="text-[11px] text-on-surface-subtle">{t("settings.copyright")}</p>
            <p className="text-[11px] text-on-surface-subtle">
              {t("settings.contact")}: {CONTACT_EMAIL}
            </p>
            <p className="text-[11px] text-on-surface-subtle">
              {t("settings.openSource")}:{" "}
              <button
                type="button"
                onClick={() => handleOpenUrl(GITHUB_REPO)}
                className="text-primary hover:underline"
              >
                {GITHUB_REPO}
              </button>
            </p>
          </div>
        </Section>
      </div>
    </PageTransition>
  );
}
