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
      className={`flex items-center gap-2.5 cursor-pointer select-none ${className}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors duration-150
          ${checked ? "bg-primary border-primary" : "bg-surface-hover border-outline-variant"}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform duration-150
            ${checked ? "translate-x-[18px] bg-white" : "translate-x-[3px] bg-on-surface-variant"}`}
        />
      </button>
      {label && <span className="text-[13px] text-on-surface">{label}</span>}
    </label>
  );
}
