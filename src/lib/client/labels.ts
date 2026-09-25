import type { CSSProperties } from "react";

/** GitHub label colours are hex without '#'; pick black or white text by luminance. */
export function labelStyle(color: string): CSSProperties {
  const hex = /^[0-9a-f]{6}$/i.test(color) ? color : "cccccc";
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return { backgroundColor: `#${hex}`, color: luminance > 0.6 ? "#111" : "#fff" };
}

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function repoShortName(repo: string): string {
  return repo.split("/")[1] ?? repo;
}
