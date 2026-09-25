import { useEffect, useState } from "react";

import type { Config, Dashboard } from "../../lib/schema";

import { api, errorMessage } from "../../lib/client/api";
import { DashboardEditor } from "./DashboardEditor";

function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function newDashboard(): Dashboard {
  return {
    id: newId(),
    name: "New dashboard",
    repos: [],
    scope: "mine",
    sort: { by: "updated", dir: "desc" },
    refreshMinutes: 5,
    swimlanes: [{ id: "all", name: "Everything", labels: [], match: "any", hideBlocked: false }],
    columns: [{ id: "todo", name: "Todo", labels: [], match: "any" }],
  };
}

type Notice = { kind: "ok" | "error"; text: string } | null;

const button = "rounded-md border px-3 py-1 text-sm";

export default function Settings() {
  const [config, setConfig] = useState<Config | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [jsonText, setJsonText] = useState<string | null>(null);

  useEffect(() => {
    api
      .config()
      .then((loaded) => {
        setConfig(loaded);
        setSelected(loaded.dashboards[0]?.id ?? null);
      })
      .catch((cause: unknown) => setNotice({ kind: "error", text: errorMessage(cause) }));
  }, []);

  if (!config) {
    return <p className="p-6 text-sm text-neutral-500">{notice?.text ?? "Loading settings…"}</p>;
  }

  const update = (next: Config) => {
    setConfig(next);
    setDirty(true);
    setNotice(null);
  };
  const updateDashboard = (dashboard: Dashboard) =>
    update({
      ...config,
      dashboards: config.dashboards.map((d) => (d.id === dashboard.id ? dashboard : d)),
    });
  const addDashboard = (template?: Dashboard) => {
    const dashboard = template
      ? { ...structuredClone(template), id: newId(), name: `${template.name} copy` }
      : newDashboard();
    update({ ...config, dashboards: [...config.dashboards, dashboard] });
    setSelected(dashboard.id);
  };
  const removeDashboard = (id: string) => {
    const dashboards = config.dashboards.filter((d) => d.id !== id);
    update({ ...config, dashboards });
    if (selected === id) setSelected(dashboards[0]?.id ?? null);
  };

  const save = async () => {
    setSaving(true);
    try {
      let payload: unknown = config;
      if (jsonText !== null) {
        payload = JSON.parse(jsonText);
      }
      const saved = await api.saveConfig(payload);
      setConfig(saved);
      setJsonText(null);
      setDirty(false);
      if (!saved.dashboards.some((d) => d.id === selected))
        setSelected(saved.dashboards[0]?.id ?? null);
      setNotice({
        kind: "ok",
        text: "Saved. Newly added repositories are syncing in the background.",
      });
    } catch (cause) {
      setNotice({ kind: "error", text: errorMessage(cause) });
    } finally {
      setSaving(false);
    }
  };

  const current = config.dashboards.find((d) => d.id === selected) ?? null;

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col p-4">
      <div className="mb-3 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Settings</h1>
        <button
          type="button"
          onClick={() => setJsonText(jsonText === null ? JSON.stringify(config, null, 2) : null)}
          className="text-sm text-sky-700 hover:underline"
        >
          {jsonText === null ? "edit as JSON" : "back to form"}
        </button>
        <span className="ml-auto text-sm">
          {notice && (
            <span className={notice.kind === "ok" ? "text-emerald-700" : "text-red-700"}>
              {notice.text}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || (!dirty && jsonText === null)}
          className={`${button} border-neutral-800 bg-neutral-800 text-white disabled:opacity-40`}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {jsonText !== null ? (
        <textarea
          value={jsonText}
          onChange={(event) => {
            setJsonText(event.target.value);
            setDirty(true);
          }}
          spellCheck={false}
          className="min-h-0 flex-1 rounded-md border border-neutral-300 bg-white p-3 font-mono text-xs"
        />
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 sm:grid-cols-[14rem_1fr]">
          <aside className="space-y-1">
            {config.dashboards.map((dashboard) => (
              <button
                key={dashboard.id}
                type="button"
                onClick={() => setSelected(dashboard.id)}
                className={`block w-full truncate rounded-md px-2 py-1 text-left text-sm ${
                  dashboard.id === selected ? "bg-neutral-800 text-white" : "hover:bg-neutral-200"
                }`}
              >
                {dashboard.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => addDashboard()}
              className="block px-2 py-1 text-sm text-sky-700 hover:underline"
            >
              + new dashboard
            </button>
          </aside>
          <div className="min-h-0 overflow-auto rounded-md border border-neutral-200 bg-white p-4">
            {current ? (
              <>
                <div className="mb-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => addDashboard(current)}
                    className={`${button} border-neutral-300 bg-white hover:bg-neutral-50`}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDashboard(current.id)}
                    className={`${button} border-red-300 bg-white text-red-700 hover:bg-red-50`}
                  >
                    Delete
                  </button>
                </div>
                <DashboardEditor key={current.id} dashboard={current} onChange={updateDashboard} />
              </>
            ) : (
              <p className="text-sm text-neutral-500">Create a dashboard to get started.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
