import type { Epic } from "../../lib/types";

interface Props {
  epics: Epic[];
  active: string | undefined;
  onSelect(key: string | undefined): void;
}

export function EpicStrip({ epics, active, onSelect }: Props) {
  if (epics.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {epics.map((epic) => {
        const selected = epic.key === active;
        return (
          <button
            key={epic.key}
            type="button"
            onClick={() => onSelect(selected ? undefined : epic.key)}
            title={epic.title}
            className={`w-52 shrink-0 rounded-md border px-2 py-1.5 text-left text-xs ${
              selected
                ? "border-violet-500 bg-violet-50"
                : "border-neutral-200 bg-white hover:border-violet-300"
            }`}
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
        );
      })}
    </div>
  );
}
