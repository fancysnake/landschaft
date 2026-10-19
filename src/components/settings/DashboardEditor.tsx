import type { Offer } from "../../lib/filter";
import type { LabelDef } from "../../lib/types";

import {
  type BoardDashboard,
  type Dashboard,
  type DashboardBase,
  dashboardFilterError,
  type DashboardType,
  type InboxDashboard,
  type SortBy,
  type SortDir,
  withType,
} from "../../lib/schema";
import { Field } from "./Field";
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
  const patch = (changes: Partial<Omit<DashboardBase, "id">>) =>
    onChange({ ...dashboard, ...changes });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field label="Name">
          <input
            value={dashboard.name}
            onChange={(event) => patch({ name: event.target.value })}
            className="field w-full"
          />
        </Field>
        <Field
          label="Type"
          hint="Switching keeps the name, filter and sort, and starts the rest afresh."
        >
          <select
            value={dashboard.type}
            onChange={(event) => onChange(withType(event.target.value as DashboardType, dashboard))}
            className="field"
          >
            <option value="board">board</option>
            <option value="inbox">inbox</option>
          </select>
        </Field>
      </div>

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

      <Field label="Default sort">
        <div className="flex gap-2">
          <select
            value={dashboard.sort.by}
            onChange={(event) =>
              patch({ sort: { ...dashboard.sort, by: event.target.value as SortBy } })
            }
            className="field"
          >
            <option value="updated">updated</option>
            <option value="created">created</option>
          </select>
          <select
            value={dashboard.sort.dir}
            onChange={(event) =>
              patch({ sort: { ...dashboard.sort, dir: event.target.value as SortDir } })
            }
            className="field"
          >
            <option value="desc">newest first</option>
            <option value="asc">oldest first</option>
          </select>
        </div>
      </Field>

      <Field
        label="Closed items (days)"
        hint="Keeps items closed within this many days, matched by is:closed; 0 shows open items only."
      >
        <input
          type="number"
          min={0}
          max={365}
          value={dashboard.closedDays}
          onChange={(event) => patch({ closedDays: Number(event.target.value) || 0 })}
          className="field w-32"
        />
      </Field>

      {dashboard.type === "board" ? (
        <BoardFields dashboard={dashboard} onChange={onChange} catalog={catalog} offer={offer} />
      ) : (
        <InboxFields dashboard={dashboard} onChange={onChange} offer={offer} />
      )}
    </div>
  );
}

/** How a swimlane's or column's filter combines, `other` looking at `others`. */
const gridHint = (others: string) => (
  <>
    every matching entry shows the item · GitHub search syntax · empty = all · <code>other</code> =
    matched by no {others}
  </>
);

function BoardFields({
  dashboard,
  onChange,
  catalog,
  offer,
}: Omit<Props, "dashboard" | "onChange"> & {
  dashboard: BoardDashboard;
  onChange(dashboard: BoardDashboard): void;
}) {
  return (
    <>
      <Field
        group
        label="Epic label"
        hint="Issues with this label appear in the epic strip with sub-issue progress."
      >
        <LabelPicker
          single
          value={dashboard.epicLabel ? [dashboard.epicLabel] : []}
          onChange={([epicLabel]) => onChange({ ...dashboard, epicLabel })}
          options={catalog}
          placeholder="none"
        />
      </Field>
      <LaneColumnEditor
        title="Swimlanes"
        items={dashboard.swimlanes}
        onChange={(swimlanes) => onChange({ ...dashboard, swimlanes })}
        create={(id) => ({ id, name: "New lane", filter: "", hideBlocked: false })}
        offer={offer}
        hint={gridHint("lane above")}
        minItems={1}
        flag={{ key: "hideBlocked", label: "hide blocked" }}
      />
      <LaneColumnEditor
        title="Columns"
        items={dashboard.columns}
        onChange={(columns) => onChange({ ...dashboard, columns })}
        create={(id) => ({ id, name: "New column", filter: "" })}
        offer={offer}
        hint={gridHint("column to the right")}
        minItems={1}
      />
    </>
  );
}

function InboxFields({
  dashboard,
  onChange,
  offer,
}: Pick<Props, "offer"> & {
  dashboard: InboxDashboard;
  onChange(dashboard: InboxDashboard): void;
}) {
  return (
    <LaneColumnEditor
      title="Groups"
      items={dashboard.groups}
      onChange={(groups) => onChange({ ...dashboard, groups })}
      create={(id) => ({ id, name: "New group", filter: "", collapsed: false })}
      offer={offer}
      hint="the first matching group takes the item · GitHub search syntax · empty = all"
      minItems={0}
      flag={{ key: "collapsed", label: "start collapsed" }}
    />
  );
}
