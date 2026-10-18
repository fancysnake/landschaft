import type { Epic } from "../../lib/types";

interface Props {
  epic: Epic;
  selected: boolean;
  onToggle(): void;
  onToggleStar(): void;
}

export function EpicTile({ epic, selected, onToggle, onToggleStar }: Props) {
  return (
    <div
      className={`flex shrink-0 rounded-lg border text-xs shadow-xs transition-colors ${epic.starred ? "w-60 border-l-[3px]" : "w-52"} ${
        selected
          ? "border-violet-400 bg-violet-50 ring-1 ring-violet-400"
          : epic.starred
            ? "border-neutral-200 border-l-amber-400 bg-white hover:border-violet-300"
            : "border-neutral-200 bg-white hover:border-violet-300"
      }`}
    >
      <button
        type="button"
        onClick={onToggleStar}
        aria-pressed={epic.starred}
        title={
          epic.starred ? "In active development; click to unmark" : "Mark as in active development"
        }
        aria-label="In active development"
        className={`flex items-center pl-1.5 text-sm ${
          epic.starred
            ? "text-amber-500 hover:text-amber-700"
            : "text-neutral-300 hover:text-amber-500"
        }`}
      >
        {epic.starred ? "★" : "☆"}
      </button>
      <button
        type="button"
        onClick={onToggle}
        title={epic.title}
        className="min-w-0 flex-1 px-2 py-1.5 text-left"
      >
        <div className="flex items-center gap-1.5">
          <span
            className={`truncate text-neutral-800 ${epic.starred ? "font-semibold" : "font-medium"}`}
          >
            {epic.title}
          </span>
          {epic.starred && (
            <span className="pill shrink-0 bg-amber-50 text-amber-700 ring-amber-200">active</span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${epic.progress?.percent ?? 0}%` }}
            />
          </div>
          <span className="tabular-nums text-neutral-500">
            {epic.progress ? `${epic.progress.completed}/${epic.progress.total}` : "–"}
          </span>
        </div>
      </button>
      <a
        href={epic.url}
        target="_blank"
        rel="noreferrer"
        title={`Open #${epic.number} on GitHub`}
        aria-label={`Open #${epic.number} on GitHub`}
        className="flex items-center px-1.5 text-neutral-400 hover:text-violet-700"
      >
        ↗
      </a>
    </div>
  );
}
