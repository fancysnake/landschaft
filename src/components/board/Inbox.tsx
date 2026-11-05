import { useCallback } from "react";

import type { InboxGroup } from "../../lib/pacts/config";
import type { Card } from "../../lib/pacts/views";

import { api } from "../../lib/client/api";
import { useFold } from "../../lib/client/useFold";
import { useSynced } from "../../lib/client/useSynced";
import { useViewRequest } from "../../lib/client/useViewRequest";
import { FoldButton } from "./FoldButton";
import { CardList } from "./IssueCard";
import { ViewShell } from "./ViewShell";

interface Props {
  dashboardId: string;
}

function GroupRow({
  group,
  cards,
  showRepo,
}: {
  group: InboxGroup;
  cards: Card[];
  showRepo: boolean;
}) {
  const [collapsed, toggle] = useFold(group.collapsed);

  return (
    <section className="panel overflow-hidden">
      <FoldButton
        collapsed={collapsed}
        onToggle={toggle}
        className="w-full gap-2 px-3 py-2 font-semibold text-neutral-900"
      >
        {group.name}
        <span className="font-normal text-neutral-500 tabular-nums">{cards.length}</span>
      </FoldButton>
      {!collapsed && cards.length > 0 && (
        <CardList cards={cards} showRepo={showRepo} className="border-t border-neutral-200" />
      )}
    </section>
  );
}

export default function Inbox({ dashboardId }: Props) {
  const view = useViewRequest();
  const { filters } = view;
  const get = useCallback(() => api.inbox(dashboardId, filters), [dashboardId, filters]);
  const { data, error, setError } = useSynced(get);

  if (!data) {
    return <p className="p-6 text-sm text-neutral-500">{error ?? "Loading inbox…"}</p>;
  }
  const { dashboard, inbox } = data;

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
        dashboard.groups.map((group) => (
          <GroupRow
            key={group.id}
            group={group}
            cards={inbox.groups[group.id] ?? []}
            showRepo={inbox.repos.length > 1}
          />
        ))
      )}
    </ViewShell>
  );
}
