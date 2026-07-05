import { useState, useRef, useEffect, type ReactNode } from "react";

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}

export function Dropdown({
  trigger,
  children,
  align = "left",
  className = "",
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(!open)} className="cursor-pointer">
        {trigger}
      </div>
      {open && (
        <div
          className={`absolute top-full mt-1 z-50 bg-surface-container rounded-xl border border-outline/60 
            shadow-md py-1.5 min-w-[180px] animate-fade-in overflow-hidden
            ${align === "right" ? "right-0" : "left-0"} ${className}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}

export function DropdownItem({
  onClick,
  children,
  danger = false,
}: DropdownItemProps) {
  return (
    <button
      onClick={() => {
        onClick();
      }}
      className={`w-full text-left px-3 py-2 text-sm transition-colors
        ${danger ? "text-error hover:bg-error/10" : "text-on-surface hover:bg-primary/[0.08] hover:text-primary"}`}
    >
      {children}
    </button>
  );
}
