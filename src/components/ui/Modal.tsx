import { type ReactNode, useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  className = "",
}: ModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ backgroundColor: "rgba(var(--md-sys-color-surface-rgb), 0.6)" }}
        onClick={onClose}
      />
      <div
        className={`relative rounded-2xl shadow-2xl border border-outline/30 
          max-w-lg w-full animate-slide-up isolate ${className}`}
        style={{ backgroundColor: "var(--md-sys-color-surface)" }}
      >
        {title && (
          <div className="flex items-center justify-between px-6 pt-5 pb-2">
            <h2 className="text-xl font-medium text-on-surface">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-full text-on-surface-variant hover:bg-on-surface/[0.08] active:bg-on-surface/[0.12] transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        )}
        <div className="px-6 pb-6 pt-2">{children}</div>
      </div>
    </div>
  );
}
