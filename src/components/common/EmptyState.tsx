import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="w-full max-w-[440px] mx-auto flex flex-col items-center justify-center py-10 px-4 rounded-[10px] border border-dashed border-outline-variant bg-surface-high">
      <div className="text-on-surface-subtle mb-3">
        {icon || <Inbox size={40} />}
      </div>
      <p className="text-[13px] text-on-surface font-medium mb-1">{title}</p>
      {description && (
        <p className="text-xs text-on-surface-variant mb-4 max-w-sm text-center">{description}</p>
      )}
      {action}
    </div>
  );
}
