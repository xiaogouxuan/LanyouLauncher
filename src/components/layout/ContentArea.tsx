import { type ReactNode } from "react";

interface ContentAreaProps {
  children: ReactNode;
}

export function ContentArea({ children }: ContentAreaProps) {
  return (
    <main className="flex-1 overflow-y-auto overflow-x-hidden bg-surface/0">
      <div className="animate-fade-in min-h-full">
        {children}
      </div>
    </main>
  );
}
