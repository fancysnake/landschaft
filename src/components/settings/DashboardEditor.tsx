import { type ReactNode, useEffect, useState } from "react";

import type { LabelDef } from "../../lib/types";

import { api } from "../../lib/client/api";
import { type Dashboard, repoName, type SortBy, type SortDir, userName } from "../../lib/schema";
import { ChipList } from "./ChipList";
import { LabelPicker } from "./LabelPicker";
import { LaneColumnEditor } from "./LaneColumnEditor";

interface Props {
  dashboard: Dashboard;
  onChange(dashboard: Dashboard): void;
}

const input = "rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function DashboardEditor({ dashboard, onChange }: Props) {
  const [catalog, setCatalog] = useState<LabelDef[]>([]);
  const reposKey = dashboard.repos.join(",");

  useEffect(() => {
    let cancelled = false;
    const request = reposKey ? api.labels(reposKey.split(",")) : Promise.resolve([]);
    request
      .then((labels) => {
        if (!cancelled) setCatalog(labels);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [reposKey]);

  const patch = (changes: Partial<Dashboard>) => onChange({ ...dashboard, ...changes });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="Name">
          <input
            value={dashboard.name}
            onChange={(event) => patch({ name: event.target.value })}
            className={`${input} w-full`}
          />
        </Field>
        <Field label="Refresh (min)">
          <input
            type="number"
            min={1}
            max={1440}
            value={dashboard.refreshMinutes}
            onChange={(event) => patch({ refreshMinutes: Number(event.target.value) || 1 })}
            className={`${input} w-full`}
          />
        </Field>
      </div>

      <Field
        label="Repositories"
        hint="Labels below are suggested from these repos once they have synced (saving triggers the first sync)."
      >
        <ChipList
          items={dashboard.repos}
          onChange={(repos) => patch({ repos })}
          schema={repoName}
          placeholder="owner/repo"
        />
      </Field>

      <Field
        label="Users"
        hint="Only issues and pull requests these users created or are assigned to; @me is you (the token's account). Empty shows everyone's."
      >
        <ChipList
          items={dashboard.users}
          onChange={(users) => patch({ users })}
          schema={userName}
          placeholder="login or @me"
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
        labels={catalog}
        axis="swimlanes"
      />
      <LaneColumnEditor
        title="Columns"
        items={dashboard.columns}
        onChange={(columns) => patch({ columns })}
        create={(id) => ({ id, name: "New column", filter: "" })}
        labels={catalog}
        axis="columns"
      />
    </div>
  );
}
