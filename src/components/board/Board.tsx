import { Fragment, useState } from "react";

import { useBoard } from "../../lib/client/useBoard";
import { useViewRequest } from "../../lib/client/useViewRequest";
import { cellKey } from "../../lib/pacts/views";
import { CardView } from "./IssueCard";
import { TONE } from "./tone";
import { ViewShell } from "./ViewShell";

interface Props {
  dashboardId: string;
}

export default function Board({ dashboardId }: Props) {
  const view = useViewRequest();
  const { data, error, dismissError } = useBoard(dashboardId, view.filters);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  if (!data) {
    return <p className="p-6 text-sm text-neutral-500">{error ?? "Loading board…"}</p>;
  }
  const { dashboard, board } = data;
  const showRepo = board.repos.length > 1;

  return (
    <ViewShell
      view={view}
      dashboard={dashboard}
      facets={board}
      count={`${board.total} issues`}
      where="on this board"
      error={error}
      onDismissError={dismissError}
      className="h-full"
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `9rem repeat(${dashboard.columns.length}, minmax(16rem, 1fr))`,
          }}
        >
          <div />
          {dashboard.columns.map((column) => (
            <div
              key={column.id}
              className="sticky top-0 z-10 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white/90 px-3 py-1.5 text-sm font-semibold text-neutral-900 shadow-xs backdrop-blur"
            >
              {column.name}
              <span className={`pill tabular-nums ${TONE.neutral}`}>
                {board.columnTotals[column.id] ?? 0}
              </span>
            </div>
          ))}
          {dashboard.swimlanes.map((lane) => {
            const collapsed = overrides[lane.id] ?? lane.collapsed;
            return (
              <Fragment key={lane.id}>
                <button
                  type="button"
                  aria-expanded={!collapsed}
                  onClick={() => setOverrides({ ...overrides, [lane.id]: !collapsed })}
                  className="sticky left-0 z-10 self-start rounded-lg border border-neutral-200 bg-white/90 px-3 py-2 text-left text-sm shadow-xs backdrop-blur hover:bg-neutral-50"
                >
                  <span className="flex items-baseline gap-1 font-semibold text-neutral-900">
                    <span className="w-3 shrink-0 text-xs text-neutral-400">
                      {collapsed ? "▸" : "▾"}
                    </span>
                    {lane.name}
                  </span>
                  <span className="block text-xs text-neutral-500 tabular-nums">
                    {board.laneTotals[lane.id] ?? 0} issues
                  </span>
                  {(board.hiddenBlocked[lane.id] ?? 0) > 0 && (
                    <span className="block text-xs font-medium text-red-700">
                      {board.hiddenBlocked[lane.id]} blocked hidden
                    </span>
                  )}
                </button>
                {dashboard.columns.map((column) => {
                  const cards = board.cells[cellKey(lane.id, column.id)] ?? [];
                  return (
                    <div
                      key={column.id}
                      className={`flex flex-col gap-2 rounded-lg bg-neutral-200/40 p-2 ${collapsed ? "" : "min-h-16"}`}
                    >
                      {collapsed ? (
                        <span className={`pill self-start tabular-nums ${TONE.neutral}`}>
                          {cards.length}
                        </span>
                      ) : (
                        cards.map((card) => (
                          <CardView key={card.key} card={card} showRepo={showRepo} />
                        ))
                      )}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
    </ViewShell>
  );
}
