import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslation } from "@/i18n";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  contentClassName?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  className = "",
  bodyClassName = "",
  contentClassName = "",
}: ModalProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-5">
      <div
        className="absolute inset-0 animate-fade-in bg-scrim backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={`relative flex flex-col w-full max-w-[520px] max-h-[min(88vh,calc(100%-2rem))] rounded-window bg-surface-high
          border border-outline shadow-dialog animate-scale-in isolate overflow-hidden ${className}`}
      >
        {title && (
          <div className={`flex items-center justify-between px-4 h-10 border-b border-outline-variant shrink-0 ${contentClassName}`}>
            <h2 className="text-[13px] font-semibold text-on-surface">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 -mr-1 rounded-btn text-on-surface-variant hover:bg-surface-hover hover:text-on-surface transition-colors"
              aria-label={String(t("common.close"))}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className={`px-4 pb-4 pt-3 overflow-y-auto min-h-0 ${bodyClassName}`}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
