import { useEffect, useState, useCallback, useMemo } from "react";
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
  RefreshCw,
  AlertTriangle,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
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

const OFFLINE_NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

export default function Accounts() {
  const { t, language } = useTranslation();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { accounts, activeAccount, setActiveAccount, setAccounts } = useAccountStore();

  const refreshAccounts = useCallback(async () => {
    try {
      const list = await accountService.getAccounts();
      setAccounts(list);
      // 删除当前账号后必须同步清空，避免残留已删除的账号
      setActiveAccount(list.find((account) => account.is_active) ?? null);
    } catch (error) {
      showToast("error", String(error));
    }
  }, [setAccounts, setActiveAccount, showToast]);

  useEffect(() => {
    const controller = new AbortController();
    for (const account of accounts) {
      preloadSkin(account, controller.signal);
    }
    return () => controller.abort();
  }, [accounts]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [showMicrosoftModal, setShowMicrosoftModal] = useState(false);
  const [showThirdPartyModal, setShowThirdPartyModal] = useState(false);
  const [offlineUsername, setOfflineUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [thirdPartyServer, setThirdPartyServer] = useState("https://littleskin.cn/api/yggdrasil");
  const [thirdPartyUsername, setThirdPartyUsername] = useState("");
  const [thirdPartyPassword, setThirdPartyPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [msLoginStep, setMsLoginStep] = useState(0);
  const [selectingSkin, setSelectingSkin] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null);

  const isTokenExpired = useCallback((account: Account) => {
    if (account.account_type !== "Microsoft") return false;
    if (!account.expires_at) return false;
    return account.expires_at * 1000 <= Date.now();
  }, []);

  const formatExpiry = useCallback(
    (account: Account) => {
      if (!account.expires_at) return t("account.expiresUnknown");
      const date = new Date(account.expires_at * 1000).toLocaleDateString(language, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return t("account.tokenValidUntil", { date });
    },
    [language, t]
  );

  const handleOfflineLogin = async () => {
    const username = offlineUsername.trim();
    if (!username) {
      setUsernameError(t("account.enterUsername"));
      return;
    }
    if (!OFFLINE_NAME_PATTERN.test(username)) {
      setUsernameError(t("account.usernameInvalid"));
      return;
    }
    setUsernameError("");
    setIsLoading(true);
    try {
      await accountService.loginOffline(username);
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

  const handleThirdPartyLogin = async () => {
    setIsLoading(true);
    try {
      await accountService.loginThirdParty(
        thirdPartyServer,
        thirdPartyUsername.trim(),
        thirdPartyPassword,
      );
      await refreshAccounts();
      setThirdPartyUsername("");
      setThirdPartyPassword("");
      setShowThirdPartyModal(false);
      setShowAddModal(false);
      showToast("success", t("account.loginSuccess"));
    } catch (error) {
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

  const handleRefreshToken = async (account: Account) => {
    setRefreshingId(account.id);
    try {
      await accountService.refreshToken(account.id);
      await refreshAccounts();
      showToast("success", t("account.tokenRefreshed"));
    } catch (error) {
      showToast("error", String(error));
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (!pendingDelete) return;
    try {
      await accountService.deleteAccount(pendingDelete.id);
      await refreshAccounts();
      showToast("success", t("account.deleteSuccess"));
      setPendingDelete(null);
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

  const otherAccounts = useMemo(
    () => accounts.filter((account) => account.id !== activeAccount?.id),
    [accounts, activeAccount]
  );

  const accountTypeLabel = (account: Account) =>
    account.account_type === "Microsoft"
      ? t("account.microsoft")
      : account.account_type === "ThirdParty"
        ? t("account.thirdParty")
        : t("account.offline");

  const accountBadges = (account: Account) => (
    <>
      <Badge
        variant={
          account.account_type === "Microsoft"
            ? "success"
            : account.account_type === "ThirdParty"
              ? "info"
              : "default"
        }
      >
        {accountTypeLabel(account)}
      </Badge>
      {isTokenExpired(account) && <Badge variant="danger">{t("account.tokenExpiredBadge")}</Badge>}
    </>
  );

  return (
    <PageTransition>
      <div className="p-5 h-full flex flex-col">
        <header className="flex items-center justify-between mb-4 pb-3 border-b border-outline-variant shrink-0">
          <div>
            <h1 className="wallpaper-text text-[18px] font-semibold tracking-tight">{t("account.title")}</h1>
          </div>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus size={15} />
            {t("account.addAccount")}
          </Button>
        </header>

        {accounts.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<User size={44} className="text-on-surface-variant" />}
              title={t("account.emptyTitle")}
              description={t("account.addAccountToStart")}
              action={
                <Button onClick={() => setShowAddModal(true)}>
                  <Plus size={15} />
                  {t("account.addAccount")}
                </Button>
              }
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-0.5">
            {activeAccount && (
              <section className="rounded-card border border-outline-variant bg-surface-high p-4 shadow-card">
                <div className="flex items-start gap-5">
                  <button
                    type="button"
                    onClick={() => openSkinPreview(activeAccount)}
                    className="flex-shrink-0 hover:opacity-85 transition-opacity rounded-[4px]"
                    title={t("account.viewSkinPreview")}
                  >
                    <SkinAvatar account={activeAccount} size={58} />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[17px] font-semibold text-on-surface">
                        {activeAccount.username}
                      </span>
                      {accountBadges(activeAccount)}
                      <span className="inline-flex items-center gap-1 h-[18px] px-1.5 text-[11px] font-medium rounded-[3px] bg-primary/8 text-primary border border-primary/25">
                        <Check size={11} />
                        {t("account.current")}
                      </span>
                    </div>

                    {activeAccount.account_type !== "Offline" && (
                      <p className="text-[12px] text-on-surface-variant mt-1.5">
                        {activeAccount.account_type === "Microsoft"
                          ? formatExpiry(activeAccount)
                          : t("account.thirdPartyServer", {
                              server: activeAccount.auth_server ?? "",
                            })}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-3.5 flex-wrap">
                      {activeAccount.account_type === "Offline" && (
                        <>
                          <Button
                            size="sm"
                            variant="tonal"
                            className="shrink-0 whitespace-nowrap"
                            onClick={() => handleSelectSkin(activeAccount)}
                            loading={selectingSkin}
                            disabled={selectingSkin}
                          >
                            <Image size={14} />
                            <span className="whitespace-nowrap">
                              {activeAccount.skin_path
                                ? t("account.changeSkin")
                                : t("account.selectSkin")}
                            </span>
                          </Button>
                          {activeAccount.skin_path && (
                            <Button
                              size="sm"
                              variant="outlined"
                              className="shrink-0 whitespace-nowrap"
                              onClick={() => handleClearSkin(activeAccount)}
                              disabled={selectingSkin}
                            >
                              <X size={14} />
                              <span className="whitespace-nowrap">{t("account.clearSkin")}</span>
                            </Button>
                          )}
                        </>
                      )}
                      {activeAccount.account_type === "Microsoft" && (
                        <Button
                          size="sm"
                          variant="tonal"
                          className="shrink-0 whitespace-nowrap"
                          onClick={() => handleRefreshToken(activeAccount)}
                          loading={refreshingId === activeAccount.id}
                          disabled={refreshingId === activeAccount.id}
                        >
                          <RefreshCw size={14} />
                          <span className="whitespace-nowrap">{t("account.refreshToken")}</span>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="text"
                        className="shrink-0 whitespace-nowrap"
                        onClick={() => openSkinPreview(activeAccount)}
                      >
                        <Eye size={14} />
                        <span className="whitespace-nowrap">{t("account.viewSkinPreview")}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="text"
                        className="shrink-0 whitespace-nowrap text-danger hover:bg-danger-container hover:text-danger"
                        onClick={() => setPendingDelete(activeAccount)}
                      >
                        <Trash2 size={14} />
                        <span className="whitespace-nowrap">{t("account.deleteAccount")}</span>
                      </Button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openSkinPreview(activeAccount)}
                    className="hidden sm:block flex-shrink-0 rounded-card overflow-hidden ring-1 ring-outline-variant hover:ring-primary/40 transition-colors"
                    title={t("account.viewSkinPreview")}
                  >
                    <SkinModel3D account={activeAccount} size={132} />
                  </button>
                </div>
              </section>
            )}

            {otherAccounts.length > 0 && (
              <section className="rounded-card border border-outline-variant bg-surface-high overflow-hidden">
                {otherAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant last:border-b-0 hover:bg-surface-hover/50 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => openSkinPreview(account)}
                      className="flex-shrink-0 hover:opacity-85 transition-opacity"
                      title={t("account.viewSkinPreview")}
                    >
                      <SkinAvatar account={account} size={34} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-medium text-on-surface truncate">
                          {account.username}
                        </span>
                        {accountBadges(account)}
                      </div>
                      {account.account_type !== "Offline" && (
                        <p className="text-[11px] text-on-surface-subtle font-mono truncate mt-0.5">
                          {account.account_type === "Microsoft"
                            ? formatExpiry(account)
                            : account.auth_server ?? ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {account.account_type === "Microsoft" && (
                        <Button
                          variant="text"
                          size="sm"
                          onClick={() => handleRefreshToken(account)}
                          loading={refreshingId === account.id}
                          disabled={refreshingId === account.id}
                          title={t("account.refreshToken")}
                        >
                          <RefreshCw size={15} />
                        </Button>
                      )}
                      {account.account_type === "Offline" && (
                        <Button
                          variant="text"
                          size="sm"
                          onClick={() => handleSelectSkin(account)}
                          loading={selectingSkin}
                          disabled={selectingSkin}
                          title={
                            account.skin_path ? t("account.changeSkin") : t("account.selectSkin")
                          }
                        >
                          <Image size={15} />
                        </Button>
                      )}
                      <Button
                        variant="text"
                        size="sm"
                        onClick={() => openSkinPreview(account)}
                        title={t("account.viewSkinPreview")}
                      >
                        <Eye size={15} />
                      </Button>
                      <Button
                        variant="tonal"
                        size="sm"
                        onClick={() => handleSwitchAccount(account)}
                      >
                        {t("account.switchAccount")}
                      </Button>
                      <Button
                        variant="text"
                        size="sm"
                        className="text-danger hover:bg-danger-container hover:text-danger"
                        onClick={() => setPendingDelete(account)}
                        title={t("account.deleteAccount")}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}

        <Modal
          open={showAddModal}
          onClose={() => !isLoading && setShowAddModal(false)}
          title={t("account.addAccountTitle")}
        >
          <div className="space-y-2.5">
            <p className="text-[12px] text-on-surface-variant mb-1">
              {t("account.selectLoginType")}
            </p>
            <button
              type="button"
              onClick={() => {
                setShowAddModal(false);
                setShowMicrosoftModal(true);
              }}
              disabled={isLoading}
              className="w-full flex items-center gap-3 p-3.5 rounded-card bg-surface-container border border-outline-variant hover:bg-surface-hover transition-colors text-left disabled:opacity-50"
            >
              <div className="h-10 w-10 rounded-btn bg-success-container flex items-center justify-center flex-shrink-0">
                <Shield size={20} className="text-success" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-on-surface">{t("account.microsoft")}</p>
                <p className="text-[12px] text-on-surface-variant truncate">
                  {t("account.microsoftDesc")}
                </p>
              </div>
              <ChevronRight size={16} className="text-on-surface-subtle flex-shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => {
                setShowAddModal(false);
                setShowOfflineModal(true);
              }}
              disabled={isLoading}
              className="w-full flex items-center gap-3 p-3.5 rounded-card bg-surface-container border border-outline-variant hover:bg-surface-hover transition-colors text-left disabled:opacity-50"
            >
              <div className="h-10 w-10 rounded-btn bg-surface-hover border border-outline-variant flex items-center justify-center flex-shrink-0">
                <Monitor size={20} className="text-on-surface-variant" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-on-surface">{t("account.offline")}</p>
                <p className="text-[12px] text-on-surface-variant truncate">
                  {t("account.offlineDesc")}
                </p>
              </div>
              <ChevronRight size={16} className="text-on-surface-subtle flex-shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => {
                setShowAddModal(false);
                setShowThirdPartyModal(true);
              }}
              disabled={isLoading}
              className="w-full flex items-center gap-3 p-3.5 rounded-card bg-surface-container border border-outline-variant hover:bg-surface-hover transition-colors text-left disabled:opacity-50"
            >
              <div className="h-10 w-10 rounded-[4px] bg-primary/8 flex items-center justify-center flex-shrink-0">
                <Globe size={20} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-on-surface">{t("account.thirdParty")}</p>
                <p className="text-[12px] text-on-surface-variant truncate">
                  {t("account.thirdPartyDesc")}
                </p>
              </div>
              <ChevronRight size={16} className="text-on-surface-subtle flex-shrink-0" />
            </button>
          </div>
        </Modal>

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
              error={usernameError}
              onChange={(e) => {
                setOfflineUsername(e.target.value);
                if (usernameError) setUsernameError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleOfflineLogin();
              }}
            />
            <p className="text-[11px] text-on-surface-subtle">
              {usernameError ? t("account.usernameInvalid") : t("account.offlineDesc")}
            </p>
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

        <Modal
          open={showThirdPartyModal}
          onClose={() => !isLoading && setShowThirdPartyModal(false)}
          title={t("account.thirdParty")}
        >
          <div className="space-y-4">
            <Input
              label={t("account.authServer")}
              placeholder={t("account.authServerPlaceholder")}
              value={thirdPartyServer}
              onChange={(e) => setThirdPartyServer(e.target.value)}
            />
            <Input
              label={t("account.username")}
              value={thirdPartyUsername}
              onChange={(e) => setThirdPartyUsername(e.target.value)}
            />
            <Input
              label={t("account.password")}
              type="password"
              value={thirdPartyPassword}
              onChange={(e) => setThirdPartyPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleThirdPartyLogin();
              }}
            />
            <p className="text-[11px] text-on-surface-subtle leading-relaxed">
              {t("account.thirdPartyHint")}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="text"
                onClick={() => setShowThirdPartyModal(false)}
                disabled={isLoading}
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleThirdPartyLogin}
                loading={isLoading}
                disabled={!thirdPartyServer.trim() || !thirdPartyUsername.trim() || !thirdPartyPassword}
              >
                {t("account.loginThirdParty")}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          open={showMicrosoftModal}
          onClose={() => !isLoading && setShowMicrosoftModal(false)}
          title={t("account.microsoft")}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-medium transition-colors ${
                      msLoginStep >= step
                        ? "bg-primary text-on-primary"
                        : "bg-surface-hover text-on-surface-subtle"
                    }`}
                  >
                    {msLoginStep > step ? <Check size={14} /> : step}
                  </div>
                  {step < 3 && (
                    <div
                      className={`w-8 h-px transition-colors ${
                        msLoginStep > step ? "bg-primary" : "bg-outline-variant"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-card bg-surface-container border border-outline-variant">
              {msLoginStep === 0 ? (
                <Shield size={20} className="text-success mt-0.5 flex-shrink-0" />
              ) : (
                <Loader size={20} className="text-primary mt-0.5 flex-shrink-0 animate-spin" />
              )}
              <div>
                <p className="text-[13px] font-medium text-on-surface">
                  {msLoginStep === 0 && t("account.microsoft")}
                  {msLoginStep === 1 && t("account.microsoftStep1")}
                  {msLoginStep === 2 && t("account.microsoftStep2")}
                  {msLoginStep === 3 && t("account.microsoftStep3")}
                </p>
                {msLoginStep === 0 && (
                  <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">
                    {t("account.microsoftOAuthDetail")}
                  </p>
                )}
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
              <Button onClick={handleMicrosoftLogin} loading={isLoading} disabled={msLoginStep > 0}>
                {t("account.loginMicrosoft")}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          open={pendingDelete !== null}
          onClose={() => setPendingDelete(null)}
          title={t("account.deleteAccount")}
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3.5 rounded-card bg-danger-container border border-danger-border">
              <AlertTriangle size={18} className="text-danger mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[13px] font-medium text-on-surface">
                  {pendingDelete?.username}
                </p>
                <p className="text-[12px] text-on-surface-variant mt-0.5 leading-relaxed">
                  {t("account.deleteConfirmDetail")}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="text" onClick={() => setPendingDelete(null)}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" onClick={handleDeleteAccount}>
                {t("common.delete")}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </PageTransition>
  );
}
