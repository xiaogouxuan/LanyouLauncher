import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Check } from "lucide-react";

interface SelectOption {
  value: string;
  label: string;
  /** 悬停时展示的补充说明 */
  description?: string;
  disabled?: boolean;
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  className = "",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);
  const selectableOptions = options.filter((opt) => !opt.disabled);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      const index = selectableOptions.findIndex((opt) => opt.value === value);
      setHighlightedIndex(index >= 0 ? index : 0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [open, value, selectableOptions]);

  useEffect(() => {
    if (open && highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [open, highlightedIndex]);

  const handleSelect = useCallback(
    (opt: SelectOption) => {
      if (opt.disabled) return;
      onChange(opt.value);
      setOpen(false);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (!open) {
            setOpen(true);
          } else {
            setHighlightedIndex((prev) =>
              prev < selectableOptions.length - 1 ? prev + 1 : 0
            );
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (!open) {
            setOpen(true);
          } else {
            setHighlightedIndex((prev) =>
              prev > 0 ? prev - 1 : selectableOptions.length - 1
            );
          }
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (!open) {
            setOpen(true);
          } else if (highlightedIndex >= 0) {
            const opt = selectableOptions[highlightedIndex];
            if (opt) handleSelect(opt);
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          break;
        case "Tab":
          setOpen(false);
          break;
      }
    },
    [disabled, open, highlightedIndex, selectableOptions, handleSelect]
  );

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-disabled={disabled}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        onKeyDown={handleKeyDown}
        title={selectedOption?.description}
        className={`w-full flex items-center justify-between gap-2 h-8 px-2.5 rounded-input
          border outline-none transition-colors duration-150 text-[13px] text-left
          ${
            disabled
              ? "bg-surface-low text-on-surface-subtle border-outline-variant opacity-45 cursor-not-allowed"
              : "bg-surface-high text-on-surface border-outline-variant hover:border-primary/40 cursor-pointer focus:border-primary focus:ring-1 focus:ring-primary/25"
          }`}
        aria-label={placeholder}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`text-on-surface-variant transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute z-50 w-full mt-1 max-h-60 overflow-auto rounded-btn
            bg-surface-highest border border-outline-variant shadow-elevated py-1 animate-fade-in"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            const isHighlighted = selectableOptions[highlightedIndex]?.value === opt.value;
            const selectableIndex = selectableOptions.findIndex((o) => o.value === opt.value);

            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                title={opt.description}
                onClick={() => handleSelect(opt)}
                onMouseEnter={() =>
                  !opt.disabled && setHighlightedIndex(selectableIndex)
                }
                className={`flex items-center justify-between gap-2 h-8 px-3 text-[13px] cursor-pointer
                  ${opt.disabled ? "text-on-surface-subtle cursor-not-allowed" : "text-on-surface"}
                  ${isHighlighted && !opt.disabled ? "bg-surface-hover" : ""}
                  ${isSelected ? "bg-primary/8 text-primary font-medium" : ""}`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check size={14} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
