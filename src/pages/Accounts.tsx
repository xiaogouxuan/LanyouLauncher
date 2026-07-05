import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  User,
  Trash2,
  Check,
  Monitor,
  Shield,
  ChevronRight,
  Image,
  X,
  Eye,
  Loader,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SkinAvatar } from "@/components/account/SkinAvatar";
import { SkinModel3D } from "@/components/account/SkinModel3D";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/EmptyState";
import { useTranslation } from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { useToast } from "@/components/ui/Toast";
import { accountService } from "@/services/accountService";
import { preloadSkin, invalidateCache } from "@/services/skinCache";
import type { Account } from "@/types/account";

export default function Accounts() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { accounts, activeAccount, setActiveAccount, setAccounts } =
    useAccountStore();

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

  // 预加载所有账号的皮肤到缓存
  useEffect(() => {
    const controller = new AbortController();
    for (const acc of accounts) {
      preloadSkin(acc, controller.signal);
    }
    return () => controller.abort();
  }, [accounts]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [showMicrosoftModal, setShowMicrosoftModal] = useState(false);
  const [offlineUsername, setOfflineUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [msLoginStep, setMsLoginStep] = useState(0);
  const [selectingSkin, setSelectingSkin] = useState(false);

  const handleOfflineLogin = async () => {
    if (!offlineUsername.trim()) {
      showToast("error", t("account.enterUsername"));
      return;
    }
    setIsLoading(true);
    try {
      await accountService.loginOffline(offlineUsername.trim());
      await refreshAccounts();
      setOfflineUsername("");
      setShowOfflineModal(false);
      setShowAddModal(false);
      showToast("success", t("account.loginSuccess"));
    } catch (error) {
      showToast("error", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setIsLoading(true);
    setMsLoginStep(1);
    try {
      setMsLoginStep(2);
      await accountService.loginMicrosoft(t("account.microsoftLoginWindowTitle"));
      setMsLoginStep(3);
      await refreshAccounts();
      setShowMicrosoftModal(false);
      setShowAddModal(false);
      setMsLoginStep(0);
      showToast("success", t("account.loginSuccess"));
    } catch (error) {
      setMsLoginStep(0);
      showToast("error", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchAccount = async (account: Account) => {
    try {
      await accountService.switchAccount(account.id);
      setActiveAccount(account);
      showToast("success", t("account.loginSuccess"));
    } catch (error) {
      showToast("error", String(error));
    }
  };

  const handleDeleteAccount = async (account: Account) => {
    try {
      await accountService.deleteAccount(account.id);
      await refreshAccounts();
      showToast("success", t("account.deleteSuccess"));
    } catch (error) {
      showToast("error", String(error));
    }
  };

  const handleSelectSkin = async (account: Account) => {
    if (account.account_type !== "Offline") return;
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

  const handleClearSkin = async (account: Account) => {
    if (account.account_type !== "Offline") return;
    try {
      invalidateCache(account.id);
      await accountService.clearAccountSkin(account.id);
      await refreshAccounts();
      showToast("success", t("account.skinCleared"));
    } catch (error) {
      showToast("error", String(error));
    }
  };

  const openSkinPreview = (account: Account) => {
    navigate(`/skin-preview?id=${account.id}`);
  };

  const otherAccounts = accounts.filter((a) => a.id !== activeAccount?.id);

  return (
    <PageTransition>
      <div className="p-6 space-y-4 h-full flex flex-col">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-on-surface">{t("account.title")}</h1>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus size={16} />
            {t("account.addAccount")}
          </Button>
        </div>

        {accounts.length === 0 ? (
          <EmptyState
            icon={<User size={48} className="text-on-surface-variant" />}
            title={t("account.emptyTitle")}
            description={t("account.addAccountToStart")}
            action={
              <Button onClick={() => setShowAddModal(true)}>
                <Plus size={18} />
                {t("account.addAccount")}
              </Button>
            }
          />
        ) : (
          <div className="space-y-4 overflow-y-auto pr-1">
            {activeAccount && (
              <Card className="p-5 border-primary/30 bg-primary-container/20">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => openSkinPreview(activeAccount)}
                    className="flex-shrink-0 hover:opacity-80 transition-opacity"
                    title={t("account.viewSkinPreview")}
                  >
                    <SkinAvatar account={activeAccount} size={72} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg font-semibold text-on-surface">
                        {activeAccount.username}
                      </span>
                      <Badge
                        variant={
                          activeAccount.account_type === "Microsoft" ? "success" : "default"
                        }
                      >
                        {activeAccount.account_type === "Microsoft"
                          ? t("account.microsoft")
                          : t("account.offline")}
                      </Badge>
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-secondary-container text-on-secondary-container">
                        <Check size={12} className="mr-1" />
                        {t("account.current")}
                      </span>
                    </div>
                    <p className="text-sm text-on-surface-variant mt-1 truncate">
                      {activeAccount.account_type === "Microsoft"
                        ? t("account.currentAccount")
                        : t("account.offlineDesc")}
                    </p>
                    <p className="text-xs text-on-surface-variant/70 mt-1 font-mono truncate">
                      ID: {activeAccount.id}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {activeAccount.account_type === "Offline" && (
                        <>
                          <Button
                            size="sm"
                            variant="tonal"
                            onClick={() => handleSelectSkin(activeAccount)}
                            loading={selectingSkin}
                            disabled={selectingSkin}
                          >
                            <Image size={14} className="mr-1" />
                            {activeAccount.skin_path ? t("account.changeSkin") : t("account.selectSkin")}
                          </Button>
                          {activeAccount.skin_path && (
                            <Button
                              size="sm"
                              variant="outlined"
                              onClick={() => handleClearSkin(activeAccount)}
                              disabled={selectingSkin}
                            >
                              <X size={14} className="mr-1" />
                              {t("account.clearSkin")}
                            </Button>
                          )}
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="text"
                        onClick={() => openSkinPreview(activeAccount)}
                      >
                        <Eye size={14} className="mr-1" />
                        {t("account.viewSkinPreview")}
                      </Button>
                    </div>
                  </div>
                  <SkinModel3D account={activeAccount} size={80} className="hidden sm:flex" />
                </div>
              </Card>
            )}

            {otherAccounts.length > 0 && (
              <div className="space-y-2">
                {otherAccounts.map((account) => (
                  <Card
                    key={account.id}
                    className="flex items-center justify-between p-3 hover:bg-surface-container-high transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => openSkinPreview(account)}
                        className="flex-shrink-0 hover:opacity-80 transition-opacity"
                        title={t("account.viewSkinPreview")}
                      >
                        <SkinAvatar account={account} size={40} />
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-on-surface truncate">
                            {account.username}
                          </span>
                          <Badge
                            variant={
                              account.account_type === "Microsoft" ? "success" : "default"
                            }
                          >
                            {account.account_type === "Microsoft"
                              ? t("account.microsoft")
                              : t("account.offline")}
                          </Badge>
                        </div>
                        <p className="text-xs text-on-surface-variant font-mono truncate">
                          {account.id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {account.account_type === "Offline" && (
                        <Button
                          variant="text"
                          size="sm"
                          onClick={() => handleSelectSkin(account)}
                          loading={selectingSkin}
                          disabled={selectingSkin}
                          title={account.skin_path ? t("account.changeSkin") : t("account.selectSkin")}
                        >
                          <Image size={16} />
                        </Button>
                      )}
                      <Button
                        variant="text"
                        size="sm"
                        onClick={() => openSkinPreview(account)}
                        title={t("account.viewSkinPreview")}
                      >
                        <Eye size={16} />
                      </Button>
                      <Button
                        variant="text"
                        size="sm"
                        onClick={() => handleSwitchAccount(account)}
                      >
                        {t("account.switchAccount")}
                      </Button>
                      <Button
                        variant="text"
                        size="sm"
                        onClick={() => handleDeleteAccount(account)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 添加账号弹窗 */}
        <Modal
          open={showAddModal}
          onClose={() => !isLoading && setShowAddModal(false)}
          title={t("account.addAccountTitle")}
        >
          <div className="space-y-3">
            <p className="text-sm text-on-surface-variant">{t("account.selectLoginType")}</p>
            <button
              type="button"
              onClick={() => {
                setShowAddModal(false);
                setShowMicrosoftModal(true);
              }}
              disabled={isLoading}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-surface-container hover:bg-surface-container-high transition-colors text-left disabled:opacity-50"
            >
              <div className="h-12 w-12 rounded-xl bg-success-container flex items-center justify-center flex-shrink-0">
                <Shield size={24} className="text-on-success-container" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-on-surface">{t("account.microsoft")}</p>
                <p className="text-sm text-on-surface-variant truncate">
                  {t("account.microsoftDesc")}
                </p>
              </div>
              <ChevronRight size={18} className="text-on-surface-variant flex-shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => {
                setShowAddModal(false);
                setShowOfflineModal(true);
              }}
              disabled={isLoading}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-surface-container hover:bg-surface-container-high transition-colors text-left disabled:opacity-50"
            >
              <div className="h-12 w-12 rounded-xl bg-surface-container-high border border-outline-variant flex items-center justify-center flex-shrink-0">
                <Monitor size={24} className="text-on-surface-variant" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-on-surface">{t("account.offline")}</p>
                <p className="text-sm text-on-surface-variant truncate">
                  {t("account.offlineDesc")}
                </p>
              </div>
              <ChevronRight size={18} className="text-on-surface-variant flex-shrink-0" />
            </button>
          </div>
        </Modal>

        {/* 离线登录弹窗 */}
        <Modal
          open={showOfflineModal}
          onClose={() => !isLoading && setShowOfflineModal(false)}
          title={t("account.offline")}
        >
          <div className="space-y-4">
            <Input
              label={t("account.username")}
              placeholder={t("account.usernamePlaceholder")}
              value={offlineUsername}
              onChange={(e) => setOfflineUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleOfflineLogin();
              }}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="text"
                onClick={() => setShowOfflineModal(false)}
                disabled={isLoading}
              >
                {t("common.cancel")}
              </Button>
              <Button onClick={handleOfflineLogin} loading={isLoading}>
                {t("account.loginOffline")}
              </Button>
            </div>
          </div>
        </Modal>

        {/* 微软登录弹窗（重新设计，参考 HMCL） */}
        <Modal
          open={showMicrosoftModal}
          onClose={() => !isLoading && setShowMicrosoftModal(false)}
          title={t("account.microsoft")}
        >
          <div className="space-y-4">
            {/* 步骤指示器 */}
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      msLoginStep >= step
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container text-on-surface-variant"
                    }`}
                  >
                    {msLoginStep > step ? <Check size={16} /> : step}
                  </div>
                  {step < 3 && (
                    <div
                      className={`w-6 h-0.5 transition-colors ${
                        msLoginStep > step ? "bg-primary" : "bg-surface-container"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* 状态说明 */}
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-surface-container">
              {msLoginStep === 0 ? (
                <Shield size={24} className="text-success mt-0.5 flex-shrink-0" />
              ) : (
                <Loader size={24} className="text-primary mt-0.5 flex-shrink-0 animate-spin" />
              )}
              <div>
                <p className="text-sm font-medium text-on-surface">
                  {msLoginStep === 0 && t("account.microsoft")}
                  {msLoginStep === 1 && t("account.microsoftStep1")}
                  {msLoginStep === 2 && t("account.microsoftStep2")}
                  {msLoginStep === 3 && t("account.microsoftStep3")}
                </p>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  {msLoginStep === 0 && t("account.microsoftOAuthDetail")}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="text"
                onClick={() => setShowMicrosoftModal(false)}
                disabled={isLoading}
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleMicrosoftLogin}
                loading={isLoading}
                disabled={msLoginStep > 0}
              >
                {t("account.loginMicrosoft")}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </PageTransition>
  );
}
