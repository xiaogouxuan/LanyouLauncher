interface SliderProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  label?: string;
  showValue?: boolean;
  formatValue?: (value: number) => string;
  className?: string;
}

export function Slider({
  min,
  max,
  step = 1,
  value,
  onChange,
  label,
  showValue = true,
  formatValue,
  className = "",
}: SliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {(label || showValue) && (
        <div className="flex items-center justify-between">
          {label && (
            <span className="text-[13px] text-on-surface-variant">{label}</span>
          )}
          {showValue && (
            <span className="text-[13px] text-on-surface font-medium tabular-nums">
              {formatValue ? formatValue(value) : value}
            </span>
          )}
        </div>
      )}
      <div className="relative h-5 flex items-center">
        <div className="absolute w-full h-1 rounded-full bg-surface-active" />
        <div
          className="absolute h-1 rounded-full bg-primary"
          style={{ width: `${percentage}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute w-full h-5 opacity-0 cursor-pointer"
        />
        <div
          className="absolute w-3 h-3 rounded-full bg-primary border border-white/70 transition-transform duration-100"
          style={{ left: `calc(${percentage}% - 6px)` }}
        />
      </div>
    </div>
  );
}
