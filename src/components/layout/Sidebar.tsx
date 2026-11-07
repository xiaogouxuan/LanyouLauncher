import { Home, Package, Puzzle, User, Settings, ChevronLeft, ChevronRight, Network } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { NavItem } from "./NavItem";
import { useTranslation } from "@/i18n";
import { useUIStore } from "@/stores/uiStore";
import { useAccountStore } from "@/stores/accountStore";
import { SkinAvatar } from "@/components/account/SkinAvatar";

export function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { accounts, activeAccount } = useAccountStore();

  const mainItems = [
    { to: "/", icon: Home, label: t("nav.home") },
    { to: "/versions", icon: Package, label: t("nav.versions") },
    { to: "/mods", icon: Puzzle, label: t("nav.mods") },
    { to: "/multiplayer", icon: Network, label: t("nav.multiplayer") },
  ];

  const bottomItems = [
    { to: "/accounts", icon: User, label: t("nav.accounts") },
    { to: "/settings", icon: Settings, label: t("nav.settings") },
  ];

  return (
    <aside
      className={`flex flex-col h-full bg-shell border-r border-primary/45
        transition-[width] duration-200 shrink-0
        ${sidebarCollapsed ? "w-[56px]" : "w-[200px]"}`}
    >
      <nav className="flex-1 flex flex-col gap-0.5 px-2 pt-2 overflow-y-auto">
        {mainItems.map((item) => (
          <NavItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            collapsed={sidebarCollapsed}
          />
        ))}
      </nav>

      {/* 底部：账号摘要、账号与设置入口 */}
      <div className="px-2 pb-2 space-y-0.5">
        {!sidebarCollapsed && (
          <button
            type="button"
            onClick={() => navigate("/accounts")}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 mb-1 rounded-[4px] text-left
              border border-outline-variant bg-surface-high hover:bg-surface-hover transition-colors duration-150"
          >
            <SkinAvatar account={activeAccount} size={24} rounded="none" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-on-surface truncate">
                {activeAccount?.username ?? t("home.noAccount")}
              </p>
              <p className="text-[10px] text-on-surface-subtle truncate">
                {activeAccount
                  ? activeAccount.account_type === "Microsoft"
                    ? t("account.microsoft")
                    : activeAccount.account_type === "ThirdParty"
                      ? t("account.thirdParty")
                      : t("account.offline")
                  : t("account.addAccountToStart")}
              </p>
            </div>
            {accounts.length > 1 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-surface-container border border-outline-variant text-on-surface-subtle tabular-nums">
                {accounts.length}
              </span>
            )}
          </button>
        )}

        {bottomItems.map((item) => (
          <NavItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            collapsed={sidebarCollapsed}
          />
        ))}

        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center h-8 rounded-btn text-on-surface-variant
            hover:bg-surface-hover hover:text-on-surface-variant transition-colors"
          title={sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
        >
          {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>
    </aside>
  );
}
