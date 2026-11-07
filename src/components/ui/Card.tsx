import type { ReactNode, CSSProperties } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  elevated?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}

/**
 * 基础面板容器：白底、细边、轻投影；悬停时轻微上浮并加深边框。
 */
export function Card({ children, className = "", hover = false, onClick, style }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={style}
      className={`bg-surface-high rounded-card border border-outline-variant p-3 transition-colors duration-150
        ${hover ? "cursor-pointer card-lift" : ""}
        ${className}`}
    >
      {children}
    </div>
  );
}
