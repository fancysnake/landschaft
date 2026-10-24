import type { Epic, Facets } from "../../lib/types";

import { useDebouncedText } from "../../lib/client/useDebouncedText";
import { type Filters, TEXT_FILTER_KEYS } from "../../lib/schema";

interface Props {
  filters: Filters;
  /** Of the view it filters. */
  facets: Facets;
  /** The board's epics; none on an inbox. */
  epics?: Epic[];
  onChange(patch: Partial<Filters>): void;
}

export function FilterBar({ filters, facets, epics, onChange }: Props) {
  const [text, setText] = useDebouncedText(filters.q ?? "", (q) => onChange({ q: q || undefined }));

  const active = TEXT_FILTER_KEYS.some((key) => filters[key]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-label="Search"
        placeholder="Search title, #number, job or branch"
        className="field w-72 max-w-full"
      />
      <select
        aria-label="Assignee"
        value={filters.assignee ?? ""}
        onChange={(event) => onChange({ assignee: event.target.value || undefined })}
        className="field"
      >
        <option value="">Any assignee</option>
        {facets.assignees.map((login) => (
          <option key={login} value={login}>
            {login}
          </option>
        ))}
      </select>
      <select
        aria-label="Label"
        value={filters.label ?? ""}
        onChange={(event) => onChange({ label: event.target.value || undefined })}
        className="field"
      >
        <option value="">Any label</option>
        {facets.labels.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {facets.types.length > 0 && (
        <select
          aria-label="Type"
          value={filters.type ?? ""}
          onChange={(event) => onChange({ type: event.target.value || undefined })}
          className="field"
        >
          <option value="">Any type</option>
          {facets.types.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}
      {epics && epics.length > 0 && (
        <select
          aria-label="Epic"
          value={filters.epic ?? ""}
          onChange={(event) => onChange({ epic: event.target.value || undefined })}
          className="field max-w-72 truncate"
        >
          <option value="">Any epic</option>
          {epics.map((epic) => (
            <option key={epic.key} value={epic.key}>
              {epic.title}
            </option>
          ))}
        </select>
      )}
      {facets.jobs.length > 0 && (
        <select
          aria-label="CI job"
          value={filters.job ?? ""}
          onChange={(event) => onChange({ job: event.target.value || undefined })}
          className="field"
        >
          <option value="">Any CI job</option>
          {facets.jobs.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}
      <span className="ml-auto flex items-center gap-2 text-sm text-neutral-500">
        <label className="flex items-center gap-2">
          Sort
          <select
            value={facets.sort.by}
            onChange={(event) => onChange({ sort: event.target.value as Filters["sort"] })}
            className="field"
          >
            <option value="updated">updated</option>
            <option value="created">created</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => onChange({ dir: facets.sort.dir === "asc" ? "desc" : "asc" })}
          className="field hover:bg-neutral-50"
          title="Toggle direction"
        >
          {facets.sort.dir === "asc" ? "↑ oldest first" : "↓ newest first"}
        </button>
      </span>
      {active && (
        <button
          type="button"
          onClick={() =>
            onChange(Object.fromEntries(TEXT_FILTER_KEYS.map((key) => [key, undefined])))
          }
          className="text-sm font-medium text-sky-700 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
