import type { ReactNode } from "react";

import type { Offer } from "../../lib/filter";
import type { LabelDef } from "../../lib/types";

import { type Dashboard, dashboardFilterError, type SortBy, type SortDir } from "../../lib/schema";
import { LabelPicker } from "./LabelPicker";
import { FilterInput, LaneColumnEditor } from "./LaneColumnEditor";

interface Props {
  dashboard: Dashboard;
  onChange(dashboard: Dashboard): void;
  /** Labels of the global repos, for the epic label picker. */
  catalog: LabelDef[];
  /** Completed in filters. */
  offer: Offer;
}

export const input = "rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function DashboardEditor({ dashboard, onChange, catalog, offer }: Props) {
  const patch = (changes: Partial<Dashboard>) => onChange({ ...dashboard, ...changes });

  return (
    <div className="space-y-6">
      <Field label="Name">
        <input
          value={dashboard.name}
          onChange={(event) => patch({ name: event.target.value })}
          className={`${input} w-full`}
        />
      </Field>

      <Field
        label="Filter"
        hint="Narrows the global repositories and users to what this dashboard shows, e.g. repo:acme/app|acme/lib user:@me. Empty shows all of them."
      >
        <FilterInput
          value={dashboard.filter}
          onChange={(filter) => patch({ filter })}
          offer={offer}
          validate={dashboardFilterError}
          placeholder="empty = all, e.g. repo:acme/app label:team-a"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Epic label"
          hint="Issues with this label appear in the epic strip with sub-issue progress."
        >
          <LabelPicker
            single
            value={dashboard.epicLabel ? [dashboard.epicLabel] : []}
            onChange={([epicLabel]) => patch({ epicLabel })}
            options={catalog}
            placeholder="none"
          />
        </Field>
        <Field label="Default sort">
          <div className="flex gap-2">
            <select
              value={dashboard.sort.by}
              onChange={(event) =>
                patch({ sort: { ...dashboard.sort, by: event.target.value as SortBy } })
              }
              className={input}
            >
              <option value="updated">updated</option>
              <option value="created">created</option>
            </select>
            <select
              value={dashboard.sort.dir}
              onChange={(event) =>
                patch({ sort: { ...dashboard.sort, dir: event.target.value as SortDir } })
              }
              className={input}
            >
              <option value="desc">newest first</option>
              <option value="asc">oldest first</option>
            </select>
          </div>
        </Field>
      </div>

      <LaneColumnEditor
        title="Swimlanes"
        items={dashboard.swimlanes}
        onChange={(swimlanes) => patch({ swimlanes })}
        create={(id) => ({ id, name: "New lane", filter: "", hideBlocked: false })}
        offer={offer}
        axis="swimlanes"
      />
      <LaneColumnEditor
        title="Columns"
        items={dashboard.columns}
        onChange={(columns) => patch({ columns })}
        create={(id) => ({ id, name: "New column", filter: "" })}
        offer={offer}
        axis="columns"
      />
    </div>
  );
}
