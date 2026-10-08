import { useId } from "react";

import type { LabelDef } from "../../lib/types";

import { filterError, suggestFilter } from "../../lib/filter";
import { AXIS_PRECEDENCE, type Axis, isCatchAll } from "../../lib/schema";

interface Group {
  id: string;
  name: string;
  filter: string;
  hideBlocked?: boolean;
}

interface Props<T extends Group> {
  title: string;
  items: T[];
  onChange(items: T[]): void;
  create(id: string): T;
  /** Suggested after `label:`. */
  labels: LabelDef[];
  /** Sets the precedence shown; swimlanes also get the "hide blocked" toggle. */
  axis: Axis;
}

function slug(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "group";
  let candidate = base;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base}-${n}`;
  return candidate;
}

const button =
  "rounded border border-neutral-300 bg-white px-1.5 text-xs leading-5 hover:bg-neutral-50 disabled:opacity-40";

export function LaneColumnEditor<T extends Group>({
  title,
  items,
  onChange,
  create,
  labels,
  axis,
}: Props<T>) {
  const replace = (index: number, item: T) =>
    onChange(items.map((current, i) => (i === index ? item : current)));
  const swap = (a: number, b: number) => {
    const next = [...items];
    const [item] = next.splice(a, 1);
    next.splice(b, 0, item!);
    onChange(next);
  };
  const catchAlls = items.filter(isCatchAll).length;
  const labelNames = [...new Set(labels.map((label) => label.name))];

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-medium">{title}</h3>
        <span className="text-xs text-neutral-500">
          {AXIS_PRECEDENCE[axis]} matching entry wins · GitHub search syntax · one catch-all (empty
          filter)
        </span>
      </div>
      {catchAlls > 1 && (
        <p className="mb-2 text-xs text-red-700">
          Only one {title.toLowerCase()} entry may be a catch-all (empty filter).
        </p>
      )}
      <ol className="space-y-2">
        {items.map((item, index) => (
          <li key={item.id} className="grid grid-cols-[10rem_1fr_auto] items-start gap-2">
            <div>
              <input
                value={item.name}
                onChange={(event) => replace(index, { ...item, name: event.target.value })}
                className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
              />
              <div className="mt-0.5 font-mono text-[10px] text-neutral-400">{item.id}</div>
              {axis === "swimlanes" && (
                <label className="mt-1 flex items-center gap-1 text-xs text-neutral-700">
                  <input
                    type="checkbox"
                    checked={Boolean(item.hideBlocked)}
                    onChange={(event) =>
                      replace(index, { ...item, hideBlocked: event.target.checked })
                    }
                  />
                  hide blocked
                </label>
              )}
            </div>
            <FilterInput
              value={item.filter}
              onChange={(filter) => replace(index, { ...item, filter })}
              labels={labelNames}
            />
            <div className="flex gap-1">
              <button
                type="button"
                className={button}
                disabled={index === 0}
                onClick={() => swap(index, index - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                className={button}
                disabled={index === items.length - 1}
                onClick={() => swap(index, index + 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className={button}
                disabled={items.length === 1}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => onChange([...items, create(slug("new", new Set(items.map((i) => i.id))))])}
        className="mt-2 text-sm text-sky-700 hover:underline"
      >
        + add
      </button>
    </section>
  );
}

/** A filter expression with completions for its last term and the parse error below it. */
function FilterInput({
  value,
  onChange,
  labels,
}: {
  value: string;
  onChange(value: string): void;
  labels: string[];
}) {
  const listId = useId();
  const error = filterError(value);
  return (
    <div>
      <input
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="empty = catch-all, e.g. label:bug -is:pr"
        aria-invalid={error !== null}
        spellCheck={false}
        className={`w-full rounded-md border px-2 py-1 font-mono text-sm ${
          error ? "border-red-400" : "border-neutral-300"
        }`}
      />
      <datalist id={listId}>
        {suggestFilter(value, labels).map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {error && <p className="mt-0.5 text-xs text-red-700">{error}</p>}
    </div>
  );
}
