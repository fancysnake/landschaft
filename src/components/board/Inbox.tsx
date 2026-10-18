import { useCallback, useState } from "react";

import { api } from "../../lib/client/api";
import { useSynced } from "../../lib/client/useSynced";
import { useViewRequest } from "../../lib/client/useViewRequest";
import { CardView } from "./IssueCard";
import { ViewShell } from "./ViewShell";

interface Props {
  dashboardId: string;
}

export default function Inbox({ dashboardId }: Props) {
  const view = useViewRequest();
  const { request } = view;
  const get = useCallback(() => api.inbox(dashboardId, request), [dashboardId, request]);
  const { data, error, setError } = useSynced(get);
  /** Collapsed state of the groups toggled since the page loaded, by id. */
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  if (!data) {
    return <p className="p-6 text-sm text-neutral-500">{error ?? "Loading inbox…"}</p>;
  }
  const { dashboard, inbox } = data;
  const showRepo = inbox.repos.length > 1;

  return (
    <ViewShell
      view={view}
      dashboard={dashboard}
      facets={inbox}
      count={`${inbox.total} items`}
      where="in this inbox"
      error={error}
      onDismissError={() => setError(null)}
      className="mx-auto max-w-4xl"
    >
      {dashboard.groups.length === 0 ? (
        <p className="text-sm text-neutral-600">
          No groups yet.{" "}
          <a href="/settings" className="text-sky-700 underline">
            Add them in settings
          </a>
          .
        </p>
      ) : (
        dashboard.groups.map((group) => {
          const cards = inbox.groups[group.id] ?? [];
          const collapsed = overrides[group.id] ?? group.collapsed;
          return (
            <section key={group.id}>
              <button
                type="button"
                aria-expanded={!collapsed}
                onClick={() => setOverrides({ ...overrides, [group.id]: !collapsed })}
                className="flex w-full items-baseline gap-2 rounded-md bg-neutral-200/90 px-2 py-1 text-left text-sm font-medium"
              >
                <span className="text-neutral-500">{collapsed ? "▸" : "▾"}</span>
                {group.name}
                <span className="text-neutral-500">{cards.length}</span>
              </button>
              {!collapsed && (
                <ul className="mt-2 flex flex-col gap-2">
                  {cards.map((card) => (
                    <li key={card.key}>
                      <CardView card={card} showRepo={showRepo} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </ViewShell>
  );
}
