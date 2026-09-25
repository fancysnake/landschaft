import { useCallback, useEffect, useRef, useState } from "react";

import type { Filters } from "../schema";

import { type Card, cellKey } from "../types";
import { api, type BoardResponse, errorMessage, filtersToQuery } from "./api";
import { readFilters } from "./useUrlFilters";

const POLL_MS = 4000;

export interface CellPosition {
  laneId: string;
  colId: string;
}

export interface BoardController {
  data: BoardResponse | null;
  error: string | null;
  loading: boolean;
  syncing: boolean;
  move(card: Card, from: CellPosition, to: CellPosition): Promise<void>;
  sync(full?: boolean): Promise<void>;
  dismissError(): void;
}

function optimisticMove(
  previous: BoardResponse,
  card: Card,
  from: CellPosition,
  to: CellPosition,
): BoardResponse {
  const fromKey = cellKey(from.laneId, from.colId);
  const toKey = cellKey(to.laneId, to.colId);
  const cells = { ...previous.board.cells };
  cells[fromKey] = (cells[fromKey] ?? []).filter((c) => c.key !== card.key);
  cells[toKey] = [card, ...(cells[toKey] ?? []).filter((c) => c.key !== card.key)];
  const laneTotals = { ...previous.board.laneTotals };
  if (from.laneId !== to.laneId) {
    laneTotals[from.laneId] = (laneTotals[from.laneId] ?? 1) - 1;
    laneTotals[to.laneId] = (laneTotals[to.laneId] ?? 0) + 1;
  }
  return { ...previous, board: { ...previous.board, cells, laneTotals } };
}

/** Loads the board for the current filters, polls the sync version, applies moves optimistically. */
export function useBoard(dashboardId: string, filters: Filters): BoardController {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const versionRef = useRef(-1);
  const filtersKey = filtersToQuery(filters);

  const apply = useCallback((response: BoardResponse) => {
    versionRef.current = response.status.version;
    setData(response);
    setError(null);
  }, []);
  const fail = useCallback((cause: unknown) => setError(errorMessage(cause)), []);
  const load = useCallback(
    () => api.board(dashboardId, readFilters(filtersKey)).then(apply, fail),
    [dashboardId, filtersKey, apply, fail],
  );

  useEffect(() => {
    load().catch(fail);
  }, [load, fail]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const status = await api.version();
        if (cancelled) return;
        if (status.version === versionRef.current) {
          setData((previous) => (previous ? { ...previous, status } : previous));
        } else {
          await load();
        }
      } catch {
        // transient; the next tick retries
      }
    };
    const onVisible = () => void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const move = useCallback(
    async (card: Card, from: CellPosition, to: CellPosition) => {
      setData((previous) => (previous ? optimisticMove(previous, card, from, to) : previous));
      try {
        await api.move({ dashboardId, repo: card.repo, number: card.number, from, to });
      } catch (cause) {
        setError(`Move failed: ${errorMessage(cause)}`);
      }
      await load();
    },
    [dashboardId, load],
  );

  const sync = useCallback(
    async (full = false) => {
      setSyncing(true);
      try {
        const response = await api.sync({ full });
        if (response.status.lastError) setError(response.status.lastError);
      } catch (cause) {
        setError(`Sync failed: ${errorMessage(cause)}`);
      } finally {
        setSyncing(false);
      }
      await load();
    },
    [load],
  );

  const dismissError = useCallback(() => setError(null), []);

  return {
    data,
    error,
    loading: data === null && error === null,
    syncing,
    move,
    sync,
    dismissError,
  };
}
