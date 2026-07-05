interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  className = "",
}: SwitchProps) {
  return (
    <label
      className={`flex items-center gap-3 cursor-pointer select-none ${className}`}
    >
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 ease-standard
          ${checked ? "bg-primary" : "bg-surface-container-highest border border-outline"}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full transition-all duration-200 ease-standard shadow-sm
            ${checked ? "translate-x-6 bg-on-primary" : "translate-x-1 bg-outline"}`}
        />
      </button>
      {label && (
        <span className="text-sm text-on-surface">{label}</span>
      )}
    </label>
  );
}