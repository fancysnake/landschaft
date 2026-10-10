import type { Offer } from "../../lib/filter";
import type { LabelDef } from "../../lib/types";

import { type Dashboard, dashboardFilterError, type SortBy, type SortDir } from "../../lib/schema";
import { Field, input } from "./Field";
import { FilterInput } from "./FilterInput";
import { LabelPicker } from "./LabelPicker";
import { LaneColumnEditor } from "./LaneColumnEditor";

interface Props {
  dashboard: Dashboard;
  onChange(dashboard: Dashboard): void;
  /** Labels of the global repos, for the epic label picker. */
  catalog: LabelDef[];
  /** Completed in filters. */
  offer: Offer;
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
