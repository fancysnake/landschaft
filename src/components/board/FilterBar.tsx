import { useEffect, useState } from "react";

import type { Filters } from "../../lib/schema";
import type { Board } from "../../lib/types";

interface Props {
  filters: Filters;
  board: Board;
  onChange(patch: Partial<Filters>): void;
}

const select = "rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-800";

export function FilterBar({ filters, board, onChange }: Props) {
  const [text, setText] = useState(filters.q ?? "");

  useEffect(() => {
    if (text === (filters.q ?? "")) return;
    const timer = setTimeout(() => onChange({ q: text || undefined }), 250);
    return () => clearTimeout(timer);
  }, [text, filters.q, onChange]);

  const active = Boolean(filters.q || filters.assignee || filters.label || filters.epic);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search title or #number"
        className={`${select} w-56`}
      />
      <select
        value={filters.assignee ?? ""}
        onChange={(event) => onChange({ assignee: event.target.value || undefined })}
        className={select}
      >
        <option value="">Any assignee</option>
        {board.assignees.map((login) => (
          <option key={login} value={login}>
            {login}
          </option>
        ))}
      </select>
      <select
        value={filters.label ?? ""}
        onChange={(event) => onChange({ label: event.target.value || undefined })}
        className={select}
      >
        <option value="">Any label</option>
        {board.labels.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {board.epics.length > 0 && (
        <select
          value={filters.epic ?? ""}
          onChange={(event) => onChange({ epic: event.target.value || undefined })}
          className={`${select} max-w-72 truncate`}
        >
          <option value="">Any epic</option>
          {board.epics.map((epic) => (
            <option key={epic.key} value={epic.key}>
              {epic.title}
            </option>
          ))}
        </select>
      )}
      <span className="ml-auto flex items-center gap-1 text-sm text-neutral-600">
        Sort
        <select
          value={board.sort.by}
          onChange={(event) => onChange({ sort: event.target.value as Filters["sort"] })}
          className={select}
        >
          <option value="updated">updated</option>
          <option value="created">created</option>
        </select>
        <button
          type="button"
          onClick={() => onChange({ dir: board.sort.dir === "asc" ? "desc" : "asc" })}
          className={`${select} hover:bg-neutral-50`}
          title="Toggle direction"
        >
          {board.sort.dir === "asc" ? "↑ oldest first" : "↓ newest first"}
        </button>
      </span>
      {active && (
        <button
          type="button"
          onClick={() => {
            setText("");
            onChange({ q: undefined, assignee: undefined, label: undefined, epic: undefined });
          }}
          className="text-sm text-sky-700 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
