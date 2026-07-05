import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

interface NavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  collapsed?: boolean;
}

export function NavItem({ to, icon: Icon, label, collapsed = false }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-full transition-all duration-200 group
        ${isActive
          ? "bg-secondary-container text-on-secondary-container font-medium"
          : "text-on-surface-variant hover:bg-on-surface/[0.08] hover:text-on-surface"
        }
        ${collapsed ? "justify-center px-2" : ""}`
      }
      title={collapsed ? label : undefined}
    >
      <Icon size={20} className="flex-shrink-0" />
      {!collapsed && (
        <span className="text-sm truncate">{label}</span>
      )}
    </NavLink>
  );
}
