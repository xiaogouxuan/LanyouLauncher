import { Home, Package, Puzzle, User, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { NavItem } from "./NavItem";
import { useTranslation } from "@/i18n";
import { useUIStore } from "@/stores/uiStore";

export function Sidebar() {
  const { t } = useTranslation();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  const navItems = [
    { to: "/", icon: Home, label: t("nav.home") },
    { to: "/versions", icon: Package, label: t("nav.versions") },
    { to: "/mods", icon: Puzzle, label: t("nav.mods") },
    { to: "/accounts", icon: User, label: t("nav.accounts") },
    { to: "/settings", icon: Settings, label: t("nav.settings") },
  ];

  return (
    <div
      className={`flex flex-col h-full bg-surface-container border-r border-outline/20 transition-all duration-300
        ${sidebarCollapsed ? "w-[64px]" : "w-[210px]"}`}
      style={{ backgroundColor: "var(--md-sys-color-surface-container)" }}
    >
      {/* 导航项 */}
      <nav className="flex-1 flex flex-col gap-1 px-2 py-4">
        {navItems.map((item) => (
          <NavItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            collapsed={sidebarCollapsed}
          />
        ))}
      </nav>

      {/* 底部折叠按钮 */}
      <div className="p-2 border-t border-outline/20">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 rounded-full text-on-surface-variant hover:bg-on-surface/[0.08] hover:text-on-surface transition-colors"
          title={sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </div>
  );
}
