import type { ReactNode } from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "violet" | "pink" | "amber" | "cyan";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

/**
 * 状态徽章：浅色底 + 同色描边，颜色强度比文字低一档，保证不喧宾夺主。
 */
const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-surface-hover text-on-surface-variant border-outline-variant",
  success: "bg-success-container text-success border-success-border",
  warning: "bg-warning-container text-warning border-warning-border",
  danger: "bg-danger-container text-danger border-danger-border",
  info: "bg-primary/10 text-primary border-primary/25",
  violet: "bg-violet-container text-violet border-violet-border",
  pink: "bg-pink-container text-pink border-pink-border",
  amber: "bg-amber-container text-amber border-amber-border",
  cyan: "bg-cyan-container text-cyan border-cyan-border",
};

export function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 h-[18px] px-1.5 text-[11px] leading-none font-medium rounded-[3px] border ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
