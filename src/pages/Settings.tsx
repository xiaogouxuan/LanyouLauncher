import { useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ExternalLink, ArrowUpRight, Globe, Palette, Download, Coffee, Monitor, Shield, Info, Image, X, LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Avatar } from "@/components/ui/Avatar";
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
  const [detectedJava, setDetectedJava] = useState<[string, string][]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  // 加载设置
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

  // 设置变化时自动保存
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
        updateSetting("background_image", path);
        updateSetting("wallpaper", ""); // 自定义图片优先于内置壁纸
        showToast("success", t("settings.backgroundSet"));
      }
    } catch (error) {
      showToast("error", String(error));
    } finally {
      setSelectingBg(false);
    }
  };

  const handleClearBackground = () => {
    updateSetting("background_image", "");
    showToast("success", t("settings.backgroundCleared"));
  };

  const wallpaperButtonBase = "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors";
  const wallpaperButtonActive = "border-primary bg-primary-container text-on-primary-container";
  const wallpaperButtonInactive = "border-outline-variant bg-surface-container text-on-surface-variant hover:text-on-surface";

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-on-surface">
          {t("settings.title")}
        </h1>

        {/* 通用设置 */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Globe size={16} className="text-on-surface-variant" />
            <h3 className="text-sm font-semibold text-on-surface">
              {t("settings.general")}
            </h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-surface">
                {t("settings.language")}
              </span>
              <Select
                options={languageOptions}
                value={language}
                onChange={(v) => {
                  setLanguage(v);
                  updateSetting("language", v);
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-surface">
                {t("settings.theme")}
              </span>
              <Select
                options={themeOptions}
                value={theme}
                onChange={(v) => {
                  setTheme(v as ThemeMode);
                  updateSetting("theme", v as ThemeMode);
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-surface">
                {t("settings.closeAfterLaunch")}
              </span>
              <Switch
                checked={settings.close_after_launch}
                onChange={(v) => updateSetting("close_after_launch", v)}
              />
            </div>
          </div>
        </Card>

        {/* 外观设置 */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Palette size={16} className="text-on-surface-variant" />
            <h3 className="text-sm font-semibold text-on-surface">
              {t("settings.appearance")}
            </h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-surface">
                {t("settings.themeColor")}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-on-surface-variant font-mono">
                  {settings.theme_color}
                </span>
                <input
                  type="color"
                  value={settings.theme_color}
                  onChange={(e) => updateSetting("theme_color", e.target.value)}
                  className="w-8 h-8 rounded-md border border-outline-variant bg-transparent cursor-pointer"
                  title={t("settings.themeColor")}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-surface">{t("settings.wallpaper")}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateSetting("wallpaper", "")}
                  className={`${wallpaperButtonBase} ${settings.wallpaper === "" ? wallpaperButtonActive : wallpaperButtonInactive}`}
                >
                  {t("settings.wallpaperNone")}
                </button>
                <button
                  type="button"
                  onClick={() => updateSetting("wallpaper", "img1")}
                  className={`${wallpaperButtonBase} ${settings.wallpaper === "img1" ? wallpaperButtonActive : wallpaperButtonInactive}`}
                >
                  <span
                    className="w-4 h-4 rounded-sm bg-cover bg-center border border-outline-variant/50"
                    style={{ backgroundImage: "url(/img/img1.png)" }}
                  />
                  {t("settings.wallpaperAzureHorizon")}
                </button>
                <button
                  type="button"
                  onClick={() => updateSetting("wallpaper", "img2")}
                  className={`${wallpaperButtonBase} ${settings.wallpaper === "img2" ? wallpaperButtonActive : wallpaperButtonInactive}`}
                >
                  <span
                    className="w-4 h-4 rounded-sm bg-cover bg-center border border-outline-variant/50"
                    style={{ backgroundImage: "url(/img/img2.png)" }}
                  />
                  {t("settings.wallpaperTwilightSakura")}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-surface">
                {t("settings.backgroundImage")}
              </span>
              <div className="flex items-center gap-2">
                {settings.background_image && (
                  <div
                    className="w-10 h-10 rounded-full bg-cover bg-center border border-outline-variant"
                    style={{
                      backgroundImage: `url(${convertFileSrc(settings.background_image)})`,
                    }}
                    title={settings.background_image}
                  />
                )}
                {settings.background_image ? (
                  <Button
                    size="sm"
                    variant="tonal"
                    onClick={handleClearBackground}
                    title={t("settings.clearBackground")}
                  >
                    <X size={14} />
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="tonal"
                  onClick={handleSelectBackground}
                  loading={selectingBg}
                >
                  <Image size={14} className="mr-1" />
                  {t("settings.selectBackground")}
                </Button>
              </div>
            </div>
            <Slider
              min={0.05}
              max={1}
              step={0.05}
              value={settings.background_opacity}
              onChange={(v) => updateSetting("background_opacity", v)}
              label={t("settings.backgroundOpacity")}
              formatValue={(v) => `${Math.round(v * 100)}%`}
            />
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
        </Card>

        {/* 下载设置 */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Download size={16} className="text-on-surface-variant" />
            <h3 className="text-sm font-semibold text-on-surface">
              {t("settings.download")}
            </h3>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-on-surface">
              {t("settings.downloadSource")}
            </span>
            <Select
              options={downloadSourceOptions}
              value={settings.download_source}
              onChange={(v) => updateSetting("download_source", v as DownloadSource)}
            />
          </div>
        </Card>

        {/* Java 设置 */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Coffee size={16} className="text-on-surface-variant" />
            <h3 className="text-sm font-semibold text-on-surface">
              {t("settings.java")}
            </h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-surface">
                {t("settings.javaPath")}
              </span>
              <Button
                size="sm"
                variant="tonal"
                onClick={handleDetectJava}
                loading={detectingJava}
              >
                {t("settings.autoDetect")}
              </Button>
            </div>
            {(detectedJava.length > 0 ? detectedJava : settings.java_paths.map((p) => [p, ""] as [string, string])).length === 0 ? (
              <p className="text-xs text-on-surface-variant">
                {t("settings.noJavaFound")}
              </p>
            ) : (
              (detectedJava.length > 0 ? detectedJava : settings.java_paths.map((p) => [p, ""] as [string, string])).map(
                ([path, version], i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <p className="text-on-surface-variant truncate flex-1" title={path}>
                      {path}
                    </p>
                    {version && (
                      <Badge variant="info" className="flex-shrink-0">
                        {version}
                      </Badge>
                    )}
                  </div>
                ),
              )
            )}
          </div>
        </Card>

        {/* 内存设置 */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Monitor size={16} className="text-on-surface-variant" />
            <h3 className="text-sm font-semibold text-on-surface">
              {t("settings.memory")}
            </h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-on-surface-variant">
                {t("settings.currentMemory")}
              </span>
              <span className="text-on-surface font-medium">
                {formatMemory(settings.default_memory)}
              </span>
            </div>
            {systemInfo && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-on-surface-variant">
                  {t("settings.recommendedMemory", {
                    total: formatMemory(systemInfo.total_memory_mb),
                  })}
                </span>
                <Button
                  size="sm"
                  variant="tonal"
                  onClick={handleUseRecommendedMemory}
                  disabled={settings.default_memory === systemInfo.recommended_memory_mb}
                >
                  {formatMemory(systemInfo.recommended_memory_mb)}
                </Button>
              </div>
            )}
            <Slider
              min={512}
              max={32768}
              step={256}
              value={settings.default_memory}
              onChange={(v) => updateSetting("default_memory", v)}
              formatValue={formatMemory}
            />
          </div>
        </Card>

        {/* 更新设置 */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Shield size={16} className="text-on-surface-variant" />
            <h3 className="text-sm font-semibold text-on-surface">
              {t("settings.update")}
            </h3>
          </div>
          <div className="space-y-3">
            <Switch
              checked={settings.auto_update}
              onChange={(v) => updateSetting("auto_update", v)}
              label={t("settings.autoUpdate")}
            />
            <Button
              size="sm"
              variant="tonal"
              onClick={handleCheckUpdate}
              loading={checkingUpdate}
            >
              {t("settings.checkUpdate")}
            </Button>
          </div>
        </Card>

        {/* 关于 */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Info size={16} className="text-on-surface-variant" />
            <h3 className="text-sm font-semibold text-on-surface">
              {t("settings.about")}
            </h3>
          </div>

          <div className="space-y-3">
            {/* 卡片1：启动器介绍 */}
            <div
              onClick={() => handleOpenUrl(GITHUB_REPO)}
              className="flex items-center justify-between p-3 rounded-xl bg-surface-container hover:bg-surface-container-high 
                cursor-pointer transition-all duration-200 hover:shadow-sm hover:scale-[1.01]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center flex-shrink-0">
                  <span className="text-on-primary-container font-bold text-sm">L</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-on-surface">
                    {APP_NAME}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {t("settings.version")} {APP_VERSION}
                  </p>
                </div>
              </div>
              <ArrowUpRight size={16} className="text-on-surface-variant flex-shrink-0" />
            </div>

            {/* 卡片2：开发者介绍 */}
            <div
              onClick={() => handleOpenUrl(BILIBILI_URL)}
              className="flex items-center justify-between p-3 rounded-xl bg-surface-container hover:bg-surface-container-high 
                cursor-pointer transition-all duration-200 hover:shadow-sm hover:scale-[1.01]"
            >
              <div className="flex items-center gap-3">
                <Avatar
                  alt={t("settings.developer")}
                  size="md"
                  className="w-10 h-10 rounded-xl"
                />
                <div>
                  <p className="text-sm font-semibold text-on-surface">
                    {t("settings.developer")}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {t("settings.bilibili")}
                  </p>
                </div>
              </div>
              <ArrowUpRight size={16} className="text-on-surface-variant flex-shrink-0" />
            </div>

            {/* 版权信息 */}
            <div className="pt-2 border-t border-outline-variant space-y-1">
              <p className="text-xs text-on-surface-variant">
                {t("settings.copyright")}
              </p>
              <p className="text-xs text-on-surface-variant">
                {t("settings.contact")}: {CONTACT_EMAIL}
              </p>
              <p className="text-xs text-on-surface-variant">
                {t("settings.openSource")}:{" "}
                <span
                  className="text-primary cursor-pointer hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenUrl(GITHUB_REPO);
                  }}
                >
                  {GITHUB_REPO}
                </span>
              </p>
            </div>
          </div>
        </Card>
      </div>
    </PageTransition>
  );
}
