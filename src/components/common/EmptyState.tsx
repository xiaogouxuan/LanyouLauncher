import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="text-on-surface-variant/40 mb-4">
        {icon || <Inbox size={48} />}
      </div>
      <p className="text-on-surface font-medium mb-1">{title}</p>
      {description && (
        <p className="text-sm text-on-surface-variant mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}
