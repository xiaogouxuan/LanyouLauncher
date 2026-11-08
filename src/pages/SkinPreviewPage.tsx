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
      setActiveAccount(list.find((a) => a.is_active) ?? null);
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
      <div className="skin-preview-enter fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface rounded-window overflow-hidden ring-1 ring-inset ring-outline-variant">
        <p className="text-on-surface-variant">{t("common.noData")}</p>
        <Button className="mt-4" onClick={() => navigate("/accounts")}>
          <ArrowLeft size={16} />
          {t("common.back")}
        </Button>
      </div>
    );
  }

  const typeLabel =
    account.account_type === "Microsoft"
      ? t("account.microsoft")
      : account.account_type === "ThirdParty"
        ? t("account.thirdParty")
        : t("account.offline");

  const modelSize = Math.min(320, Math.max(190, window.innerWidth - 560));

  return (
    <div className="skin-preview-enter fixed inset-0 z-50 flex flex-col bg-surface rounded-window overflow-hidden ring-1 ring-inset ring-outline-variant">
      {/* 顶部导航 */}
      <header className="flex items-center gap-4 px-5 h-14 border-b border-outline-variant shrink-0">
        <button
          type="button"
          onClick={() => navigate("/accounts")}
          className="flex items-center gap-1.5 h-8 px-2 rounded-btn text-[12.5px] font-medium
            text-on-surface-variant hover:text-on-surface hover:bg-surface-hover transition-colors"
        >
          <ArrowLeft size={16} />
          {t("common.back")}
        </button>
        <div className="flex-1" />
        <SkinAvatar account={account} size={30} className="ring-2 ring-primary/10" />
        <span className="text-[13px] font-semibold text-on-surface">{account.username}</span>
        <Badge variant={isOffline ? "default" : "info"}>{typeLabel}</Badge>
      </header>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-8 p-6 md:p-10 overflow-y-auto">
        <div className="relative shrink-0 rounded-card border border-outline-variant bg-surface-high shadow-card">
          <SkinModel3D account={account} size={modelSize} className="relative" />
        </div>

        <div className="flex flex-col gap-3 w-full md:w-72 max-w-sm">
          <div className="rounded-card border border-outline-variant bg-surface-container p-4">
            <p className="text-[12.5px] font-medium text-on-surface">{t("skinPreview.dragToRotate")}</p>
            <p className="text-[11.5px] text-on-surface-subtle mt-0.5">
              {t("skinPreview.scrollToRotate")}
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
                <Upload size={17} />
                {account.skin_path ? t("account.changeSkin") : t("account.selectSkin")}
              </Button>

              {account.skin_path && (
                <Button
                  variant="outlined"
                  onClick={handleClearSkin}
                  disabled={selectingSkin}
                  size="lg"
                >
                  <Trash2 size={17} />
                  {t("account.clearSkin")}
                </Button>
              )}
            </>
          )}

          {!isOffline && (
            <p className="text-[11.5px] text-on-surface-subtle text-center leading-relaxed">
              {t("skinPreview.microsoftSkinNote")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
