import { Fragment, useMemo } from "react";

import { repoShortName } from "../../lib/client/labels";
import { useBoard } from "../../lib/client/useBoard";
import { useHiddenRepos } from "../../lib/client/useHiddenRepos";
import { useUrlFilters } from "../../lib/client/useUrlFilters";
import { hiddenRepos, repoFilter, shownRepos } from "../../lib/schema";
import { cellKey } from "../../lib/types";
import { EpicStrip } from "./EpicStrip";
import { FilterBar } from "./FilterBar";
import { IssueCard } from "./IssueCard";
import { SyncStatus } from "./SyncStatus";
import { Toggles } from "./Toggles";

interface Props {
  dashboardId: string;
}

export default function Board({ dashboardId }: Props) {
  const [filters, updateFilters] = useUrlFilters();
  const [hidden, setHidden] = useHiddenRepos();
  const request = useMemo(() => ({ ...filters, hide: hidden }), [filters, hidden]);
  const { data, error, loading, syncing, sync, setEpicStarred, dismissError } = useBoard(
    dashboardId,
    request,
  );

  if (!data) {
    return <p className="p-6 text-sm text-neutral-500">{loading ? "Loading board…" : error}</p>;
  }
  const { dashboard, board, status } = data;
  const showRepo = board.repos.length > 1;

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-lg font-semibold">
          {dashboard.name}
          <span className="ml-2 text-sm font-normal text-neutral-500">
            {board.total} issues
            {dashboard.filter && (
              <code title="Dashboard filter" className="ml-2 text-xs">
                {dashboard.filter}
              </code>
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
          lane or column with the filter <code>other</code> in{" "}
          <a href="/settings" className="underline">
            settings
          </a>
          .
        </p>
      )}

      {showRepo && (
        <Toggles
          label="Repositories"
          options={board.repos.map((repo) => ({ value: repo, label: repoShortName(repo) }))}
          selected={shownRepos(request, board.repos)}
          onChange={(next) => {
            updateFilters({ repo: repoFilter(next, board.repos) });
            setHidden(hiddenRepos(next, board.repos, hidden));
          }}
        />
      )}
      {dashboard.epicLabel && (
        <EpicStrip
          epics={board.epics}
          active={filters.epic}
          onSelect={(key) => updateFilters({ epic: key })}
          onSetStarred={(key, starred) => void setEpicStarred(key, starred)}
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
                    <IssueCard key={card.key} card={card} showRepo={showRepo} />
                  ))}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
