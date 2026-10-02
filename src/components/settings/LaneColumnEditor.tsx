import type { IssueKind, LabelDef } from "../../lib/types";

import {
  AXIS_PRECEDENCE,
  type Axis,
  isCatchAll,
  type KindFilter,
  type Match,
  STATUS_LABEL_NAMES,
} from "../../lib/schema";
import { LabelPicker } from "./LabelPicker";

interface Group {
  id: string;
  name: string;
  labels: string[];
  match: Match;
  kind: KindFilter;
  hideBlocked?: boolean;
}

interface Props<T extends Group> {
  title: string;
  items: T[];
  onChange(items: T[]): void;
  create(id: string): T;
  labels: LabelDef[];
  /** Sets the precedence shown; swimlanes also get the "hide blocked" toggle. */
  axis: Axis;
}

/**
 * The picker shows an entry's `kind` as an `is:issue` / `is:pr` chip, as on GitHub, and
 * offers the PR status labels (`is:conflicting`, ...), which stay in `labels`.
 */
const CHIP_COLOR = "e5e5e5";
const pickerOption = (name: string): LabelDef => ({
  name,
  color: CHIP_COLOR,
  repo: "",
  description: null,
});
const KIND_CHIPS = (["issue", "pr"] as const).map((kind) => pickerOption(`is:${kind}`));
const STATUS_CHIPS = STATUS_LABEL_NAMES.map(pickerOption);
const isKindChip = (name: string) => KIND_CHIPS.some((c) => c.name === name);

function toChips(group: Group): string[] {
  return group.kind === "any" ? group.labels : [`is:${group.kind}`, ...group.labels];
}

/** Picker chips back to labels and kind; the last kind chip picked wins; status chips stay labels. */
function fromChips(value: string[]): Pick<Group, "labels" | "kind"> {
  const chip = value.findLast(isKindChip);
  return {
    labels: value.filter((name) => !isKindChip(name)),
    kind: chip ? (chip.slice("is:".length) as IssueKind) : "any",
  };
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
  const options = [...labels, ...KIND_CHIPS, ...STATUS_CHIPS];

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-medium">{title}</h3>
        <span className="text-xs text-neutral-500">
          {AXIS_PRECEDENCE[axis]} matching entry wins · any or all of its labels · is:issue / is:pr
          · {STATUS_LABEL_NAMES.join(" / ")} · one catch-all (no labels)
        </span>
      </div>
      {catchAlls > 1 && (
        <p className="mb-2 text-xs text-red-700">
          Only one {title.toLowerCase()} entry may be a catch-all (no labels).
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
            <div className="flex items-start gap-2">
              {item.labels.length >= 2 && (
                <select
                  value={item.match}
                  onChange={(event) =>
                    replace(index, { ...item, match: event.target.value as Match })
                  }
                  title="Match any of the labels, or require all of them"
                  className="rounded-md border border-neutral-300 bg-white px-1.5 py-1.5 text-xs"
                >
                  <option value="any">any of</option>
                  <option value="all">all of</option>
                </select>
              )}
              <div className="flex-1">
                <LabelPicker
                  value={toChips(item)}
                  onChange={(value) => replace(index, { ...item, ...fromChips(value) })}
                  options={options}
                />
              </div>
            </div>
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
