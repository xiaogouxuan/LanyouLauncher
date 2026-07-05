import { type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant =
  | "filled"
  | "primary" // 兼容旧版
  | "tonal"
  | "secondary" // 兼容旧版 -> tonal
  | "elevated"
  | "outlined"
  | "text"
  | "ghost" // 兼容旧版 -> text
  | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  fab?: boolean;
  extendedFab?: boolean;
  children: ReactNode;
}

function normalizeVariant(variant: ButtonVariant): ButtonVariant {
  if (variant === "primary") return "filled";
  if (variant === "secondary") return "tonal";
  if (variant === "ghost") return "text";
  return variant;
}

const baseStyles =
  "inline-flex items-center justify-center gap-2 font-medium relative overflow-hidden transition-all duration-200 ease-standard disabled:opacity-40 disabled:cursor-not-allowed";

const variantStyles: Record<string, string> = {
  filled:
    "bg-primary text-on-primary hover:shadow-md active:shadow-sm before:absolute before:inset-0 before:bg-on-primary/0 hover:before:bg-on-primary/[0.08] active:before:bg-on-primary/[0.12]",
  tonal:
    "bg-primary-container text-on-primary-container hover:shadow-sm active:shadow-none before:absolute before:inset-0 before:bg-on-primary-container/0 hover:before:bg-on-primary-container/[0.08] active:before:bg-on-primary-container/[0.12]",
  elevated:
    "bg-surface-container-low text-primary shadow-md hover:shadow-lg active:shadow-sm before:absolute before:inset-0 before:bg-primary/0 hover:before:bg-primary/[0.05] active:before:bg-primary/[0.08]",
  outlined:
    "bg-transparent text-primary border border-outline hover:bg-primary/[0.05] active:bg-primary/[0.08]",
  text:
    "bg-transparent text-primary hover:bg-primary/[0.05] active:bg-primary/[0.08]",
  danger:
    "bg-error text-on-error hover:shadow-md active:shadow-sm before:absolute before:inset-0 before:bg-on-error/0 hover:before:bg-on-error/[0.08] active:before:bg-on-error/[0.12]",
};

const sizeStyles: Record<string, string> = {
  sm: "px-3 py-1.5 text-xs rounded-btn min-h-[32px]",
  md: "px-4 py-2 text-sm rounded-btn min-h-[40px]",
  lg: "px-6 py-3 text-base rounded-btn min-h-[48px]",
};

const fabStyles =
  "w-14 h-14 rounded-full shadow-md hover:shadow-lg active:shadow-sm p-0 before:absolute before:inset-0 before:rounded-full before:bg-on-primary/0 hover:before:bg-on-primary/[0.08] active:before:bg-on-primary/[0.12]";

const extendedFabStyles =
  "px-5 h-14 rounded-full shadow-md hover:shadow-lg active:shadow-sm before:absolute before:inset-0 before:rounded-full before:bg-on-primary/0 hover:before:bg-on-primary/[0.08] active:before:bg-on-primary/[0.12]";

export function Button({
  variant = "filled",
  size = "md",
  loading = false,
  fab = false,
  extendedFab = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const normalized = normalizeVariant(variant);

  const classes = [
    baseStyles,
    fab ? fabStyles : extendedFab ? extendedFabStyles : sizeStyles[size],
    fab || extendedFab
      ? variantStyles.filled
      : variantStyles[normalized],
    disabled || loading ? "pointer-events-none" : "cursor-pointer",
    className,
  ].join(" ");

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4 relative z-10"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}
