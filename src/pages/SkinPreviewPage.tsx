import { useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SkinModel3D } from "@/components/account/SkinModel3D";
import { SkinAvatar } from "@/components/account/SkinAvatar";
import { useTranslation } from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { useToast } from "@/components/ui/Toast";
import { accountService } from "@/services/accountService";
import { invalidateCache } from "@/services/skinCache";

export default function SkinPreviewPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get("id");

  const { accounts, setAccounts, setActiveAccount } = useAccountStore();
  const [selectingSkin, setSelectingSkin] = useState(false);

  const account = accounts.find((a) => a.id === accountId) ?? null;
  const isOffline = account?.account_type === "Offline";

  const refreshAccounts = useCallback(async () => {
    try {
      const list = await accountService.getAccounts();
      setAccounts(list);
      const active = list.find((a) => a.is_active);
      if (active) setActiveAccount(active);
    } catch (error) {
      showToast("error", String(error));
    }
  }, [setAccounts, setActiveAccount, showToast]);

  const handleSelectSkin = async () => {
    if (!account) return;
    setSelectingSkin(true);
    try {
      const path = await accountService.selectAccountSkin(account.id);
      if (path) {
        invalidateCache(account.id);
        await refreshAccounts();
        showToast("success", t("account.skinSet"));
      }
    } catch (error) {
      showToast("error", String(error));
    } finally {
      setSelectingSkin(false);
    }
  };

  const handleClearSkin = async () => {
    if (!account) return;
    try {
      invalidateCache(account.id);
      await accountService.clearAccountSkin(account.id);
      await refreshAccounts();
      showToast("success", t("account.skinCleared"));
    } catch (error) {
      showToast("error", String(error));
    }
  };

  if (!account) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ backgroundColor: "var(--md-sys-color-surface)" }}>
        <p className="text-on-surface-variant">{t("common.noData")}</p>
        <Button className="mt-4" onClick={() => navigate("/accounts")}>
          <ArrowLeft size={16} className="mr-1" />
          {t("common.back")}
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "var(--md-sys-color-surface)" }}>
      {/* 顶部导航 */}
      <header className="flex items-center gap-4 px-6 py-4 border-b border-outline-variant/20">
          <button
            type="button"
            onClick={() => navigate("/accounts")}
            className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <ArrowLeft size={18} />
            {t("common.back")}
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <SkinAvatar account={account} size={32} />
            <div>
              <span className="font-semibold text-on-surface">{account.username}</span>
              <Badge
                variant={isOffline ? "default" : "success"}
                className="ml-2"
              >
                {isOffline ? t("account.offline") : t("account.microsoft")}
              </Badge>
            </div>
          </div>
        </header>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-8 p-6 md:p-12 overflow-hidden">
        {/* 3D 模型预览 — 大尺寸 */}
        <div className="flex-shrink-0 flex items-center justify-center">
          <SkinModel3D account={account} size={Math.min(320, window.innerWidth - 120)} />
        </div>

        {/* 操作面板 */}
        <div className="flex flex-col gap-4 w-72 max-w-full">
          <div className="p-4 rounded-2xl bg-surface-container text-center">
            <p className="text-sm text-on-surface-variant mb-1">
              {t("skinPreview.dragToRotate")}
            </p>
            <p className="text-xs text-on-surface-variant/60">
              {t("skinPreview.scrollToZoom")}
            </p>
          </div>

          {isOffline && (
            <>
              <Button
                onClick={handleSelectSkin}
                loading={selectingSkin}
                disabled={selectingSkin}
                size="lg"
              >
                <Upload size={18} className="mr-2" />
                {account.skin_path
                  ? t("account.changeSkin")
                  : t("account.selectSkin")}
              </Button>

              {account.skin_path && (
                <Button
                  variant="outlined"
                  onClick={handleClearSkin}
                  disabled={selectingSkin}
                  size="lg"
                >
                  <Trash2 size={18} className="mr-2" />
                  {t("account.clearSkin")}
                </Button>
              )}
            </>
          )}

          {!isOffline && (
            <p className="text-sm text-on-surface-variant/60 text-center">
              {t("skinPreview.microsoftSkinNote")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
