import { type ReactNode } from "react";

interface ContentAreaProps {
  children: ReactNode;
}

export function ContentArea({ children }: ContentAreaProps) {
  return (
    <main className="relative flex-1 overflow-y-auto overflow-x-hidden bg-surface isolate">
      {children}
    </main>
  );
}
