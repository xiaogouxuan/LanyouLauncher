import type { ReactNode, CSSProperties } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  elevated?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}

export function Card({
  children,
  className = "",
  hover = false,
  elevated = false,
  onClick,
  style,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      style={style}
      className={`bg-surface-container-high rounded-card border border-outline/40 
        ${elevated ? "shadow-md" : "shadow-sm"} 
        p-5 transition-all duration-250 ease-standard
        ${hover ? "cursor-pointer hover:bg-surface-container-highest hover:shadow-md hover:border-outline/60" : ""}
        ${className}`}
    >
      {children}
    </div>
  );
}
