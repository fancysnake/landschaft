import { Fragment } from "react";

import { useBoard } from "../../lib/client/useBoard";
import { useViewRequest } from "../../lib/client/useViewRequest";
import { cellKey } from "../../lib/types";
import { EpicStrip } from "./EpicStrip";
import { CardView } from "./IssueCard";
import { ViewShell } from "./ViewShell";

interface Props {
  dashboardId: string;
}

export default function Board({ dashboardId }: Props) {
  const view = useViewRequest();
  const { data, error, setEpicStarred, dismissError } = useBoard(dashboardId, view.request);

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
      epics={board.epics}
      above={
        dashboard.epicLabel && (
          <EpicStrip
            epics={board.epics}
            active={view.filters.epic}
            onSelect={(key) => view.updateFilters({ epic: key })}
            onSetStarred={(key, starred) => void setEpicStarred(key, starred)}
          />
        )
      }
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
              <span className="pill bg-neutral-100 text-neutral-600 ring-neutral-200 tabular-nums">
                {board.columnTotals[column.id] ?? 0}
              </span>
            </div>
          ))}
          {dashboard.swimlanes.map((lane) => (
            <Fragment key={lane.id}>
              <div className="sticky left-0 z-10 self-start rounded-lg border border-l-[3px] border-neutral-200 border-l-neutral-400 bg-white/90 px-3 py-2 text-sm shadow-xs backdrop-blur">
                <div className="font-semibold text-neutral-900">{lane.name}</div>
                <div className="text-xs text-neutral-500 tabular-nums">
                  {board.laneTotals[lane.id] ?? 0} issues
                </div>
                {(board.hiddenBlocked[lane.id] ?? 0) > 0 && (
                  <div className="text-xs font-medium text-red-700">
                    {board.hiddenBlocked[lane.id]} blocked hidden
                  </div>
                )}
              </div>
              {dashboard.columns.map((column) => (
                <div
                  key={column.id}
                  className="flex min-h-16 flex-col gap-2 rounded-lg bg-neutral-200/40 p-2"
                >
                  {(board.cells[cellKey(lane.id, column.id)] ?? []).map((card) => (
                    <CardView key={card.key} card={card} showRepo={showRepo} />
                  ))}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </ViewShell>
  );
}
