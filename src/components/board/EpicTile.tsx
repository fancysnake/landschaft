import type { Epic } from "../../lib/types";

interface Props {
  epic: Epic;
  selected: boolean;
  onToggle(): void;
}

export function EpicTile({ epic, selected, onToggle }: Props) {
  return (
    <div
      className={`flex w-52 shrink-0 rounded-md border text-xs ${
        selected
          ? "border-violet-500 bg-violet-50"
          : "border-neutral-200 bg-white hover:border-violet-300"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        title={epic.title}
        className="min-w-0 flex-1 px-2 py-1.5 text-left"
      >
        <div className="truncate font-medium text-neutral-800">{epic.title}</div>
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
