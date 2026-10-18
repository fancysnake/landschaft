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
          className="grid gap-2"
          style={{
            gridTemplateColumns: `9rem repeat(${dashboard.columns.length}, minmax(16rem, 1fr))`,
          }}
        >
          <div />
          {dashboard.columns.map((column) => (
            <div
              key={column.id}
              className="sticky top-0 z-10 rounded-md bg-neutral-200/90 px-2 py-1 text-sm font-medium backdrop-blur"
            >
              {column.name}
              <span className="ml-2 text-neutral-500">{board.columnTotals[column.id] ?? 0}</span>
            </div>
          ))}
          {dashboard.swimlanes.map((lane) => (
            <Fragment key={lane.id}>
              <div className="sticky left-0 z-10 rounded-md bg-neutral-200/90 px-2 py-1 text-sm backdrop-blur">
                <div className="font-medium">{lane.name}</div>
                <div className="text-xs text-neutral-500">
                  {board.laneTotals[lane.id] ?? 0} issues
                </div>
                {(board.hiddenBlocked[lane.id] ?? 0) > 0 && (
                  <div className="text-xs text-red-700">
                    {board.hiddenBlocked[lane.id]} blocked hidden
                  </div>
                )}
              </div>
              {dashboard.columns.map((column) => (
                <div
                  key={column.id}
                  className="flex min-h-16 flex-col gap-2 rounded-md bg-neutral-100/60 p-2"
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
