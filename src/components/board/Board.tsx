import type { Column, Swimlane } from "../../lib/pacts/config";

import { useBoard } from "../../lib/client/useBoard";
import { useFold } from "../../lib/client/useFold";
import { useViewRequest } from "../../lib/client/useViewRequest";
import { type Board as BoardData, cellKey, laneRows } from "../../lib/pacts/views";
import { FoldButton } from "./FoldButton";
import { CardList } from "./IssueCard";
import { ViewShell } from "./ViewShell";

interface Props {
  dashboardId: string;
}

interface RowProps {
  columns: Column[];
  board: BoardData;
}

const cardsIn = (board: BoardData, lane: Swimlane, column: Column) =>
  board.cells[cellKey(lane.id, column.id)] ?? [];

/** One count per column; the lowest stand out. */
function FoldedCounts({ lane, columns, board }: RowProps & { lane: Swimlane }) {
  return columns.map((column) => {
    const low = board.lowest[lane.id]?.includes(column.id);
    return (
      <div
        key={column.id}
        title={low ? `Fewest ${lane.name}` : undefined}
        className={`rounded-md py-1 text-center text-5xl font-semibold tabular-nums ${
          low ? "bg-emerald-800 text-white" : "bg-neutral-200/60 text-neutral-500"
        }`}
      >
        {cardsIn(board, lane, column).length}
        {low && <span className="sr-only"> fewest</span>}
      </div>
    );
  });
}

function SolidLane({
  lane,
  columns,
  board,
  showRepo,
}: RowProps & { lane: Swimlane; showRepo: boolean }) {
  const [collapsed, toggle] = useFold(lane.collapsed);
  const hidden = board.hiddenBlocked[lane.id] ?? 0;

  return (
    <>
      <div className="col-span-full -mb-1">
        <FoldButton
          collapsed={collapsed}
          onToggle={toggle}
          className="sticky left-0 w-fit gap-1.5 rounded text-sm"
        >
          <span className="font-semibold text-neutral-900">{lane.name}</span>
          <span className="text-xs text-neutral-500 tabular-nums">
            {board.laneTotals[lane.id] ?? 0}
          </span>
          {hidden > 0 && (
            <span className="text-xs font-medium text-red-700">{hidden} blocked hidden</span>
          )}
        </FoldButton>
      </div>
      {collapsed ? (
        <FoldedCounts lane={lane} columns={columns} board={board} />
      ) : (
        columns.map((column) => (
          <CardList
            key={column.id}
            cards={cardsIn(board, lane, column)}
            showRepo={showRepo}
            className="min-h-8"
          />
        ))
      )}
    </>
  );
}

/** One list per column: the lanes in order, each headed by its name where it has cards. */
function FluidLanes({
  lanes,
  columns,
  board,
  showRepo,
}: RowProps & { lanes: Swimlane[]; showRepo: boolean }) {
  return columns.map((column) => (
    <div key={column.id} className="flex min-h-8 flex-col gap-2">
      {lanes.map((lane) => {
        const cards = cardsIn(board, lane, column);
        return (
          cards.length > 0 && (
            <section key={lane.id}>
              <h3 className="mb-0.5 flex justify-between px-1 text-xs font-medium text-neutral-500">
                {lane.name}
                <span className="tabular-nums">{cards.length}</span>
              </h3>
              <CardList cards={cards} showRepo={showRepo} />
            </section>
          )
        );
      })}
    </div>
  ));
}

export default function Board({ dashboardId }: Props) {
  const view = useViewRequest();
  const { data, error, dismissError } = useBoard(dashboardId, view.filters);

  if (!data) {
    return <p className="p-6 text-sm text-neutral-500">{error ?? "Loading board…"}</p>;
  }
  const { dashboard, board } = data;
  const { columns } = dashboard;
  const row = { columns, board, showRepo: board.repos.length > 1 };

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
          className="grid gap-x-4 gap-y-3"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(16rem, 1fr))` }}
        >
          {columns.map((column) => {
            const hidden = board.fluidHiddenBlocked[column.id] ?? 0;
            return (
              <div
                key={column.id}
                className="sticky top-0 z-10 flex items-baseline gap-2 border-b-2 border-neutral-800 bg-neutral-100 px-1 py-1 font-semibold text-neutral-900"
              >
                {column.name}
                <span className="text-sm font-normal text-neutral-500 tabular-nums">
                  {board.columnTotals[column.id] ?? 0}
                </span>
                {hidden > 0 && (
                  <span className="ml-auto text-xs font-medium text-red-700">
                    {hidden} blocked hidden
                  </span>
                )}
              </div>
            );
          })}
          {laneRows(dashboard.swimlanes).map((lanes) =>
            lanes[0].fluid ? (
              <FluidLanes key={lanes[0].id} lanes={lanes} {...row} />
            ) : (
              <SolidLane key={lanes[0].id} lane={lanes[0]} {...row} />
            ),
          )}
        </div>
      </div>
    </ViewShell>
  );
}
