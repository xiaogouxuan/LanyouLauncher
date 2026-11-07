import { type ButtonHTMLAttributes, type ReactNode } from "react";

/*
 * 兼容旧调用方的变体别名：primary 等价 filled，secondary 等价 tonal，
 * ghost 等价 text。新代码应直接使用标准变体名。
 */
type ButtonVariant =
  | "filled"
  | "primary"
  | "tonal"
  | "secondary"
  | "elevated"
  | "outlined"
  | "text"
  | "ghost"
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
  "inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap shrink-0 select-none rounded-btn transition-colors duration-150 disabled:opacity-45 disabled:pointer-events-none active:brightness-95";

const variantStyles: Record<string, string> = {
  filled:
    "bg-primary text-white border border-primary hover:brightness-110",
  tonal:
    "bg-primary/8 text-primary border border-primary/25 hover:bg-primary/14",
  elevated:
    "bg-surface-high text-on-surface border border-outline-variant hover:bg-surface-hover",
  outlined:
    "bg-transparent text-on-surface border border-outline hover:bg-surface-hover hover:border-primary/50",
  text:
    "bg-surface-high/85 text-on-surface border border-primary/20 backdrop-blur-sm hover:bg-surface-high hover:border-primary/35",
  danger:
    "bg-danger text-white border border-danger hover:brightness-110",
};

const sizeStyles: Record<string, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-[12.5px]",
  lg: "h-9 px-3.5 text-[13px]",
};

const fabStyles = "w-9 h-9 p-0";
const extendedFabStyles = "h-9 px-3.5 text-[13px]";

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
    variantStyles[normalized],
    className,
  ].join(" ");

  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
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
      <span className="inline-flex items-center justify-center gap-1.5">
        {children}
      </span>
    </button>
  );
}
