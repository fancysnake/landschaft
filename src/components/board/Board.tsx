import type { Column, Swimlane } from "../../lib/pacts/config";

import { useBoard } from "../../lib/client/useBoard";
import { useFold } from "../../lib/client/useFold";
import { useViewRequest } from "../../lib/client/useViewRequest";
import { type Board as BoardData, cellKey } from "../../lib/pacts/views";
import { FoldButton } from "./FoldButton";
import { CardView } from "./IssueCard";
import { TONE } from "./tone";
import { ViewShell } from "./ViewShell";

interface Props {
  dashboardId: string;
}

const CELL = "flex flex-col gap-2 rounded-lg bg-neutral-200/40 p-2";

function LaneRow({
  lane,
  columns,
  board,
}: {
  lane: Swimlane;
  columns: Column[];
  board: BoardData;
}) {
  const [collapsed, toggle] = useFold(lane.collapsed);
  const showRepo = board.repos.length > 1;

  return (
    <>
      <FoldButton
        collapsed={collapsed}
        onToggle={toggle}
        className="sticky left-0 z-10 gap-1 self-start rounded-lg border border-neutral-200 bg-white/90 px-3 py-2 text-sm shadow-xs backdrop-blur"
      >
        <span className="min-w-0">
          <span className="block font-semibold text-neutral-900">{lane.name}</span>
          <span className="block text-xs text-neutral-500 tabular-nums">
            {board.laneTotals[lane.id] ?? 0} issues
          </span>
          {(board.hiddenBlocked[lane.id] ?? 0) > 0 && (
            <span className="block text-xs font-medium text-red-700">
              {board.hiddenBlocked[lane.id]} blocked hidden
            </span>
          )}
        </span>
      </FoldButton>
      {columns.map((column) => {
        const cards = board.cells[cellKey(lane.id, column.id)] ?? [];
        return collapsed ? (
          <div key={column.id} className={CELL}>
            <span className={`pill self-start tabular-nums ${TONE.neutral}`}>{cards.length}</span>
          </div>
        ) : (
          <div key={column.id} className={`${CELL} min-h-16`}>
            {cards.map((card) => (
              <CardView key={card.key} card={card} showRepo={showRepo} />
            ))}
          </div>
        );
      })}
    </>
  );
}

export default function Board({ dashboardId }: Props) {
  const view = useViewRequest();
  const { data, error, dismissError } = useBoard(dashboardId, view.filters);

  if (!data) {
    return <p className="p-6 text-sm text-neutral-500">{error ?? "Loading board…"}</p>;
  }
  const { dashboard, board } = data;

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
          {dashboard.swimlanes.map((lane) => (
            <LaneRow key={lane.id} lane={lane} columns={dashboard.columns} board={board} />
          ))}
        </div>
      </div>
    </ViewShell>
  );
}
