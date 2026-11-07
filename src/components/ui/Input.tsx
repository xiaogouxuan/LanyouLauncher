import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        {label && (
          <label className="text-xs font-medium text-on-surface-variant">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`h-8 px-2.5 rounded-input bg-surface-high text-on-surface border text-[13px]
            border-outline-variant placeholder:text-on-surface-subtle outline-none transition-colors duration-150
            hover:border-primary/40
            focus:border-primary focus:ring-1 focus:ring-primary/25
            disabled:opacity-45 disabled:pointer-events-none
            ${error ? "border-danger focus:border-danger focus:ring-danger/25" : ""}`}
          {...props}
        />
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    );
  }
);

Input.displayName = "Input";
