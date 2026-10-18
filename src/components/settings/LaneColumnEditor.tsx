import type { ReactNode } from "react";

import { filterError, type Offer } from "../../lib/filter";
import { FilterInput } from "./FilterInput";

interface Group {
  id: string;
  name: string;
  filter: string;
}

/** The keys of `T` holding a boolean. */
type FlagKey<T> = { [K in keyof T]: T[K] extends boolean ? K : never }[keyof T];

interface Props<T extends Group> {
  title: string;
  items: T[];
  onChange(items: T[]): void;
  create(id: string): T;
  /** Completed in filters. */
  offer: Offer;
  /** How the entries' filters combine, beside the title. */
  hint: ReactNode;
  /** Below which "remove" is off. */
  minItems: number;
  /** A per-entry checkbox and its label. */
  flag?: { key: FlagKey<T>; label: string };
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
  "rounded-md border border-neutral-200 bg-white px-1.5 text-xs leading-5 text-neutral-600 shadow-xs hover:bg-neutral-50 disabled:opacity-40";

export function LaneColumnEditor<T extends Group>({
  title,
  items,
  onChange,
  create,
  offer,
  hint,
  minItems,
  flag,
}: Props<T>) {
  const replace = (index: number, item: T) =>
    onChange(items.map((current, i) => (i === index ? item : current)));
  const swap = (a: number, b: number) => {
    const next = [...items];
    const [item] = next.splice(a, 1);
    next.splice(b, 0, item!);
    onChange(next);
  };

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-medium">{title}</h3>
        <span className="text-xs text-neutral-500">{hint}</span>
      </div>
      <ol className="space-y-2">
        {items.map((item, index) => (
          <li key={item.id} className="grid grid-cols-[10rem_1fr_auto] items-start gap-2">
            <div>
              <input
                value={item.name}
                onChange={(event) => replace(index, { ...item, name: event.target.value })}
                className="field w-full"
              />
              <div className="mt-0.5 font-mono text-[10px] text-neutral-400">{item.id}</div>
              {flag && (
                <label className="mt-1 flex items-center gap-1 text-xs text-neutral-700">
                  <input
                    type="checkbox"
                    checked={Boolean(item[flag.key])}
                    onChange={(event) =>
                      replace(index, { ...item, [flag.key]: event.target.checked })
                    }
                  />
                  {flag.label}
                </label>
              )}
            </div>
            <FilterInput
              value={item.filter}
              onChange={(filter) => replace(index, { ...item, filter })}
              offer={offer}
              validate={filterError}
              placeholder="empty = all, e.g. label:bug -is:pr, other label:bug"
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
                disabled={items.length <= minItems}
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
