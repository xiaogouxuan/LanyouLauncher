import type { ReactNode } from "react";

interface BadgeProps {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "purple";
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<string, string> = {
  default: "bg-surface-container-highest text-on-surface-variant border-outline/40",
  success: "bg-secondary-container text-on-secondary-container border-outline/20",
  warning: "bg-tertiary-container text-on-tertiary-container border-outline/20",
  danger: "bg-error-container text-on-error-container border-outline/20",
  info: "bg-primary-container text-on-primary-container border-outline/20",
  purple: "bg-tertiary-container text-on-tertiary-container border-outline/20",
};

export function Badge({
  variant = "default",
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-md border ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
