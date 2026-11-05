import type { ReactNode } from "react";

interface Props {
  collapsed: boolean;
  onToggle(): void;
  className: string;
  children: ReactNode;
}

export function FoldButton({ collapsed, onToggle, className, children }: Props) {
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      onClick={onToggle}
      className={`flex items-baseline text-left hover:bg-neutral-50 ${className}`}
    >
      <span className="w-3 shrink-0 text-xs text-neutral-400">{collapsed ? "▸" : "▾"}</span>
      {children}
    </button>
  );
}
