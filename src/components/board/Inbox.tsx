import { useCallback, useMemo, useState } from "react";

import { api } from "../../lib/client/api";
import { useHiddenRepos } from "../../lib/client/useHiddenRepos";
import { useSynced } from "../../lib/client/useSynced";
import { useUrlFilters } from "../../lib/client/useUrlFilters";
import { ErrorBanner } from "../ErrorBanner";
import { FilterBar } from "./FilterBar";
import { IssueCard } from "./IssueCard";

interface Props {
  dashboardId: string;
}

export default function Inbox({ dashboardId }: Props) {
  const [filters, updateFilters] = useUrlFilters();
  const [hidden] = useHiddenRepos();
  const request = useMemo(() => ({ ...filters, hide: hidden }), [filters, hidden]);
  const get = useCallback(() => api.inbox(dashboardId, request), [dashboardId, request]);
  const { data, error, setError } = useSynced(get);
  /** Groups toggled away from their configured `collapsed`, until the page reloads. */
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());

  if (!data) {
    return <p className="p-6 text-sm text-neutral-500">{error ?? "Loading inbox…"}</p>;
  }
  const { dashboard, inbox } = data;
  const showRepo = inbox.repos.length > 1;
  const toggle = (id: string) =>
    setToggled((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-lg font-semibold">
          {dashboard.name}
          <span className="ml-2 text-sm font-normal text-neutral-500">
            {inbox.total} items
            {dashboard.filter && (
              <code title="Dashboard filter" className="ml-2 text-xs">
                {dashboard.filter}
              </code>
            )}
          </span>
        </h1>
      </header>

      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}
      {inbox.repos.length > 0 && inbox.repos.every((repo) => hidden.includes(repo)) && (
        <p className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-600">
          Every repository with items in this inbox is switched off in the bar above.
        </p>
      )}
      <FilterBar filters={filters} board={inbox} onChange={updateFilters} />

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
          const collapsed = group.collapsed !== toggled.has(group.id);
          return (
            <section key={group.id}>
              <button
                type="button"
                aria-expanded={!collapsed}
                onClick={() => toggle(group.id)}
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
                      <IssueCard card={card} showRepo={showRepo} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
