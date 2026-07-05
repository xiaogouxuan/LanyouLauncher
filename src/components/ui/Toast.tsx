import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { CheckCircle, AlertCircle, XCircle, X } from "lucide-react";

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
  success: CheckCircle,
  error: XCircle,
  info: AlertCircle,
};

const containerStyles: Record<string, string> = {
  success: "bg-inverse-surface text-inverse-on-surface",
  error: "bg-error-container text-on-error-container border-error/30",
  info: "bg-primary-container text-on-primary-container border-primary/30",
};

const iconColorMap: Record<string, string> = {
  success: "text-inverse-primary",
  error: "text-error",
  info: "text-primary",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastMessage["type"], message: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-14 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => {
          const Icon = iconMap[toast.type];
          return (
            <div
              key={toast.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-md 
                animate-slide-up pointer-events-auto min-w-[260px] ${containerStyles[toast.type]}`}
            >
              <Icon size={18} className={iconColorMap[toast.type]} />
              <span className="text-sm flex-1">{toast.message}</span>
              <button
                onClick={() => dismiss(toast.id)}
                className="p-1 rounded-full hover:bg-on-surface/[0.08] transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
