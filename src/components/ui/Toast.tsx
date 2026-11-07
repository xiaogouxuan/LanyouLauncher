import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, XCircle, X } from "lucide-react";

interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

interface ToastContextType {
  showToast: (type: ToastMessage["type"], message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const iconMap = {
  success: CheckCircle2,
  error: XCircle,
  info: AlertCircle,
};

const iconColorMap: Record<string, string> = {
  success: "text-success",
  error: "text-danger",
  info: "text-primary",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastMessage["type"], message: string) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[10000] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => {
          const Icon = iconMap[toast.type];
          return (
            <div
              key={toast.id}
              className="relative flex items-center gap-2.5 pl-4 pr-3 py-2.5 rounded-btn bg-surface-highest
                border border-outline-variant shadow-elevated animate-slide-up pointer-events-auto
                min-w-[240px] max-w-[380px] overflow-hidden"
            >
              <Icon size={16} className={iconColorMap[toast.type]} />
              <span className="text-[13px] text-on-surface flex-1 break-words">{toast.message}</span>
              <button
                onClick={() => dismiss(toast.id)}
                className="p-1 rounded-btn text-on-surface-subtle hover:bg-surface-hover hover:text-on-surface transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
