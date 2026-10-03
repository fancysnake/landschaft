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
      className={`flex shrink-0 rounded-md border text-xs ${epic.starred ? "w-60 border-l-4" : "w-52"} ${
        selected
          ? "border-violet-500 bg-violet-50"
          : epic.starred
            ? "border-amber-300 border-l-amber-500 bg-amber-50 shadow-sm hover:border-violet-300"
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
            <span className="shrink-0 rounded bg-amber-100 px-1 text-amber-800">active</span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded bg-neutral-200">
            <div
              className="h-full bg-emerald-500"
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
