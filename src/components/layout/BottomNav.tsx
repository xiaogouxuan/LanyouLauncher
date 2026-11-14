import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { SkinAvatar } from "@/components/account/SkinAvatar";

/**
 * 底部导航：与顶部栏一致，不设底板与描边，直接压在壁纸上。
 * 标签平时为纯文字，选中项是反色实心胶囊；右侧显示当前账号。
 */
export function BottomNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeAccount } = useAccountStore();

  const items = [
    { to: "/", label: t("nav.home") },
    { to: "/versions", label: t("nav.versions") },
    { to: "/mods", label: t("nav.mods") },
    { to: "/multiplayer", label: t("nav.multiplayer") },
    { to: "/accounts", label: t("nav.accounts") },
    { to: "/settings", label: t("nav.settings") },
  ];

  const accountType = activeAccount
    ? activeAccount.account_type === "Microsoft"
      ? t("account.microsoft")
      : activeAccount.account_type === "ThirdParty"
        ? t("account.thirdParty")
        : t("account.offline")
    : t("account.addAccountToStart");

  return (
    <nav className="relative z-[1] shrink-0 h-[56px] pl-4 pr-3 flex items-center justify-between gap-3 select-none">
      <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center h-[30px] px-3 rounded-[6px] text-[12.5px] font-medium
              whitespace-nowrap transition-colors duration-150
              ${isActive ? "nav-tab-active" : "nav-tab"}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      <button
        type="button"
        onClick={() => navigate("/accounts")}
        className="nav-account flex items-center gap-2 h-[38px] pl-1 pr-2.5 rounded-[6px] shrink-0"
      >
        <SkinAvatar account={activeAccount} size={24} rounded="none" />
        <div className="text-left leading-tight min-w-0">
          <p className="nav-tab text-[12px] font-medium truncate max-w-[130px]">
            {activeAccount?.username ?? t("home.noAccount")}
          </p>
          <p className="nav-tab text-[10px] opacity-80 truncate max-w-[130px]">
            {accountType}
          </p>
        </div>
      </button>
    </nav>
  );
}
