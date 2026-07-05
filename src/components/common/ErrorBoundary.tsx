import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { t } from "@/i18n/useTranslation";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center bg-surface">
          <div className="text-center p-8">
            <AlertTriangle size={48} className="text-error mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-on-surface mb-2">
              {t("errorBoundary.title")}
            </h2>
            <p className="text-sm text-on-surface-variant mb-4 max-w-md">
              {this.state.error?.message || t("common.unknownError")}
            </p>
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              {t("errorBoundary.reload")}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
