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
          <label className="text-xs font-medium text-on-surface-variant px-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`px-3.5 py-2.5 rounded-input bg-surface-container-low text-on-surface border 
            border-outline placeholder:text-on-surface-variant/50 outline-none transition-all duration-200
            hover:border-on-surface-variant
            focus:border-primary focus:ring-1 focus:ring-primary/20
            disabled:bg-surface-container/50 disabled:text-on-surface/40 disabled:border-outline/50
            ${error ? "border-error focus:border-error focus:ring-error/20" : ""}`}
          {...props}
        />
        {error && (
          <span className="text-xs text-error px-1">{error}</span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
