import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

interface NavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  collapsed?: boolean;
  trailing?: ReactNode;
}

/**
 * 侧边栏导航项：参考 PCL 的列表项选中方式——
 * 左侧 2px 强调色条 + 浅色底 + 强调色文字，而不是整块实心填充。
 */
export function NavItem({ to, icon: Icon, label, collapsed = false, trailing }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `group relative flex items-center h-9 rounded-[4px] transition-colors duration-150
        ${collapsed ? "justify-center px-0" : "gap-2.5 pl-3 pr-2.5"}
        ${
          isActive
            ? "bg-primary/8 text-primary font-semibold"
            : "text-on-surface-variant hover:bg-surface-hover hover:text-on-surface"
        }`
      }
      title={collapsed ? label : undefined}
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-[1px] bg-primary" />
          )}
          <span
            className={`flex items-center justify-center w-5 h-5 flex-shrink-0 transition-colors ${
              isActive ? "text-primary" : "text-on-surface-variant group-hover:text-on-surface"
            }`}
          >
            <Icon size={16} strokeWidth={2} />
          </span>
          {!collapsed && (
            <span className="text-[12.5px] truncate flex-1">{label}</span>
          )}
          {!collapsed && trailing}
        </>
      )}
    </NavLink>
  );
}
