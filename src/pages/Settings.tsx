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
  Github,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { PageTransition } from "@/components/common/PageTransition";
import { UpdateDialog } from "@/components/update/UpdateDialog";
import { useTranslation } from "@/i18n";
import { useUIStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToast } from "@/components/ui/Toast";
import { APP_NAME, APP_VERSION, GITEE_REPO, BILIBILI_URL, AUTHOR_NAME, AUTHOR_URL, CONTACT_EMAIL } from "@/utils/constants";
import { formatMemory } from "@/utils/format";
import { settingsService, type SystemInfo } from "@/services/settingsService";
import { updateService, type UpdateRelease } from "@/services/updateService";
import type { ThemeMode, DownloadSource, UIMaterial } from "@/types/settings";
import { BUILTIN_WALLPAPERS, builtinWallpaperThemeColor } from "@/lib/wallpaperTheme";

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
    <section className="ui-panel rounded-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 h-11">
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
  const { settings, updateSetting, hydrated } = useSettingsStore();

  const languageOptions = [
    { value: "zh-CN", label: t("settings.langZhCN") },
    { value: "en-US", label: t("settings.langEnUS") },
  ];

  const themeOptions = [
    { value: "light", label: t("settings.themeLight") },
    { value: "dark", label: t("settings.themeDark") },
    { value: "system", label: t("settings.themeSystem") },
  ];

  const materialOptions = [
    { value: "solid", label: t("settings.uiMaterialSolid") },
    { value: "frosted", label: t("settings.uiMaterialFrosted") },
    { value: "liquid", label: t("settings.uiMaterialLiquid") },
  ];

  /**
   * 用了内置壁纸时，调色盘第一项就换成这套壁纸的配套主题色，
   * 选中壁纸后高亮自然落在第一项上，而不是仍然停留在默认蓝。
   */
  const wallpaperThemeColor = settings.background_image
    ? null
    : builtinWallpaperThemeColor(settings.wallpaper);
  const themeColors = wallpaperThemeColor
    ? [
        wallpaperThemeColor,
        ...THEME_COLORS.filter(
          (color) => color.toLowerCase() !== wallpaperThemeColor.toLowerCase(),
        ),
      ]
    : THEME_COLORS;
  /** 实际生效的主色：跟随壁纸时用壁纸配套色，调色盘的选中态也以它为准 */
  const activeThemeColor =
    settings.theme_color_auto && wallpaperThemeColor
      ? wallpaperThemeColor
      : settings.theme_color;

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
  const [activeTab, setActiveTab] = useState("general");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateRelease, setUpdateRelease] = useState<UpdateRelease | null>(null);
  const [selectingBg, setSelectingBg] = useState(false);
  const [downloadingJava, setDownloadingJava] = useState<number | null>(null);
  const [detectedJava, setDetectedJava] = useState<[string, string][]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    // 设置已由根节点统一从磁盘加载过，这里不再重复读取，
    // 否则返回首页再进入本页时会用磁盘旧值覆盖刚才的修改（例如刚换的壁纸）。
    settingsService
      .getSystemInfo()
      .then((info) => setSystemInfo(info))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // 未完成首次加载前不写盘，避免把默认设置覆盖到用户配置上。
    if (!hydrated) return;
    settingsService.queueSave(settings);
  }, [settings, hydrated]);

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
        setUpdateRelease(release);
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
        updateSetting("theme_color", activeThemeColor);
        updateSetting("theme_color_auto", false);
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

  const tabs = [
    { id: "general", label: t("settings.general") },
    { id: "appearance", label: t("settings.appearance") },
    { id: "download", label: t("settings.download") },
    { id: "java", label: t("settings.java") },
    { id: "memory", label: t("settings.memory") },
    { id: "update", label: t("settings.update") },
    { id: "about", label: t("settings.about") },
  ];

  return (
    <PageTransition>
      <div className="p-5 max-w-[860px] mx-auto">
        <h1 className="wallpaper-text text-[18px] font-semibold tracking-tight">
          {t("settings.title")}
        </h1>

        <div className="ui-panel mt-3 inline-flex max-w-full items-center gap-0.5 p-1 rounded-[9px] overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`h-7 px-3 rounded-[6px] text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "bg-primary text-white"
                  : "text-on-surface-variant hover:bg-surface-hover hover:text-on-surface"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 每个设置分类有自己的入场方式，靠 settings-tab-<id> 区分 */}
        <div key={activeTab} className={`settings-panel settings-tab-${activeTab} mt-4 space-y-3.5`}>
        {activeTab === "general" && (
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
        )}

        {activeTab === "appearance" && (
        <Section icon={<Palette size={15} />} title={t("settings.appearance")}>
          <Row label={t("settings.themeColor")}>
            <div className="flex items-center gap-1.5">
              {themeColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    updateSetting("theme_color", color);
                    updateSetting("theme_color_auto", false);
                  }}
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-105 ${
                    activeThemeColor.toLowerCase() === color.toLowerCase()
                      ? "ring-1 ring-primary"
                      : ""
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={color}
                >
                  {activeThemeColor.toLowerCase() === color.toLowerCase() && (
                    <Check size={12} className="text-white" />
                  )}
                </button>
              ))}
              <input
                type="color"
                value={activeThemeColor}
                onChange={(e) => {
                  updateSetting("theme_color", e.target.value);
                  updateSetting("theme_color_auto", false);
                }}
                className="w-6 h-6 rounded-full border border-outline-variant bg-transparent cursor-pointer overflow-hidden"
                title={t("settings.themeColor")}
              />
            </div>
          </Row>

          <Row label={t("settings.uiMaterial")}>
            <Select
              className="w-[150px]"
              options={materialOptions}
              value={settings.ui_material}
              onChange={(v) => updateSetting("ui_material", v as UIMaterial)}
            />
          </Row>
          {settings.ui_material === "liquid" && (
            <div className="flex items-start gap-2 px-4 py-2.5 border-t border-outline-variant">
              <AlertTriangle size={13} className="shrink-0 mt-0.5 text-warning" />
              <p className="text-[11px] leading-relaxed text-on-surface-variant">
                {t("settings.uiMaterialLiquidHint")}
              </p>
            </div>
          )}

          <div className="px-4 py-3 border-b border-outline-variant">
            <p className="text-[13px] text-on-surface mb-2.5">{t("settings.wallpaper")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  // 关掉壁纸时保留当前主色，避免界面突然变回默认蓝
                  updateSetting("theme_color", activeThemeColor);
                  updateSetting("theme_color_auto", false);
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
                    // 内置壁纸自带配套主题色，切换壁纸时整站主色一起换掉
                    updateSetting("theme_color", item.themeColor);
                    updateSetting("theme_color_auto", true);
                  }}
                  className={`relative h-[52px] w-[84px] rounded-btn border overflow-hidden transition-colors ${
                    settings.wallpaper === item.id ? wallpaperActive : wallpaperIdle
                  }`}
                >
                  <span
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(/img/${item.id}.jpg)` }}
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
                      : "#2F6BFF"
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
                      : "#2F6BFF",
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
        )}

        {activeTab === "download" && (
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
        )}

        {activeTab === "java" && (
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
        )}

        {activeTab === "memory" && (
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
        )}

        {activeTab === "update" && (
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
        )}

        {activeTab === "about" && (
        <Section icon={<Info size={15} />} title={t("settings.about")}>
          <button
            type="button"
            onClick={() => handleOpenUrl(GITEE_REPO)}
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
            onClick={() => handleOpenUrl(AUTHOR_URL)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-outline-variant hover:bg-surface-hover/50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-btn bg-primary/8 border border-primary/25 flex items-center justify-center flex-shrink-0 text-primary">
                <Github size={17} />
              </div>
              <div>
                <p className="text-[13px] font-medium text-on-surface">{AUTHOR_NAME}</p>
                <p className="text-[11px] text-on-surface-subtle mt-0.5">{t("settings.authorRole")}</p>
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
              <div className="w-9 h-9 rounded-btn bg-primary/8 border border-primary/25 flex items-center justify-center flex-shrink-0 overflow-hidden">
                <img src="/team.webp" alt={t("settings.developer")} className="w-9 h-9 object-cover" />
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
                onClick={() => handleOpenUrl(GITEE_REPO)}
                className="text-primary hover:underline"
              >
                {GITEE_REPO}
              </button>
            </p>
          </div>
        </Section>
        )}
        </div>

        <UpdateDialog
          open={Boolean(updateRelease)}
          release={updateRelease}
          onClose={() => setUpdateRelease(null)}
        />
      </div>
    </PageTransition>
  );
}
