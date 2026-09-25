import { Fragment, useState } from "react";

import type { DragPayload } from "../../lib/client/dnd";

import { useBoard } from "../../lib/client/useBoard";
import { useUrlFilters } from "../../lib/client/useUrlFilters";
import { cellKey } from "../../lib/types";
import { Cell } from "./Cell";
import { EpicStrip } from "./EpicStrip";
import { FilterBar } from "./FilterBar";
import { SyncStatus } from "./SyncStatus";

interface Props {
  dashboardId: string;
}

export default function Board({ dashboardId }: Props) {
  const [filters, updateFilters] = useUrlFilters();
  const { data, error, loading, syncing, move, sync, dismissError } = useBoard(
    dashboardId,
    filters,
  );
  const [dragging, setDragging] = useState<DragPayload | null>(null);

  if (!data) {
    return <p className="p-6 text-sm text-neutral-500">{loading ? "Loading board…" : error}</p>;
  }
  const { dashboard, board, status } = data;
  const showRepo = dashboard.repos.length > 1;
  const columnTotals = Object.fromEntries(
    dashboard.columns.map((column) => [
      column.id,
      dashboard.swimlanes.reduce(
        (sum, lane) => sum + (board.cells[cellKey(lane.id, column.id)]?.length ?? 0),
        0,
      ),
    ]),
  );
  const total = Object.values(board.laneTotals).reduce((sum, n) => sum + n, 0);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-lg font-semibold">
          {dashboard.name}
          <span className="ml-2 text-sm font-normal text-neutral-500">
            {total} issues
            {dashboard.scope === "mine" && (
              <span title="Created by or assigned to you">
                {" "}
                · mine{status.viewer ? ` (${status.viewer})` : ""}
              </span>
            )}
          </span>
        </h1>
        <SyncStatus status={status} syncing={syncing} onSync={(full) => void sync(full)} />
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={dismissError} className="font-medium hover:underline">
            dismiss
          </button>
        </div>
      )}
      {board.unplaced > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {board.unplaced} issue{board.unplaced === 1 ? "" : "s"} match no swimlane or column. Add a
          catch-all (a lane or column without labels) in{" "}
          <a href="/settings" className="underline">
            settings
          </a>
          .
        </p>
      )}

      {dashboard.epicLabel && (
        <EpicStrip
          epics={board.epics}
          active={filters.epic}
          onSelect={(key) => updateFilters({ epic: key })}
        />
      )}
      <FilterBar filters={filters} board={board} onChange={updateFilters} />

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
              <span className="ml-2 text-neutral-500">{columnTotals[column.id]}</span>
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
                <Cell
                  key={column.id}
                  laneId={lane.id}
                  colId={column.id}
                  cards={board.cells[cellKey(lane.id, column.id)] ?? []}
                  showRepo={showRepo}
                  dragging={dragging}
                  onDragStart={setDragging}
                  onDragEnd={() => setDragging(null)}
                  onDrop={(payload) => {
                    setDragging(null);
                    void move(
                      payload.card,
                      { laneId: payload.laneId, colId: payload.colId },
                      { laneId: lane.id, colId: column.id },
                    );
                  }}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
