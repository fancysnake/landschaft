import { useCallback, useEffect, useRef, useState } from "react";

import type { Filters } from "../schema";

import { api, type BoardResponse, errorMessage, filtersToQuery } from "./api";
import { readFilters } from "./useUrlFilters";

const POLL_MS = 4000;

export interface BoardController {
  data: BoardResponse | null;
  error: string | null;
  loading: boolean;
  syncing: boolean;
  sync(full?: boolean): Promise<void>;
  setEpicStarred(epic: string, starred: boolean): Promise<void>;
  dismissError(): void;
}

/** Loads the board for the current filters, polls the sync version. */
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

  /** Runs a write, reports its failure as "`what` failed", then reloads either way. */
  const mutate = useCallback(
    async (what: string, call: () => Promise<unknown>) => {
      try {
        await call();
      } catch (cause) {
        setError(`${what} failed: ${errorMessage(cause)}`);
      }
      await load();
    },
    [load],
  );

  const sync = useCallback(
    async (full = false) => {
      setSyncing(true);
      await mutate("Sync", async () => {
        try {
          const response = await api.sync({ full });
          if (response.status.lastError) setError(response.status.lastError);
        } finally {
          setSyncing(false);
        }
      });
    },
    [mutate],
  );

  const setEpicStarred = useCallback(
    (epic: string, starred: boolean) =>
      mutate("Starring epic", () => api.setEpicStarred(dashboardId, { epic, starred })),
    [dashboardId, mutate],
  );

  const dismissError = useCallback(() => setError(null), []);

  return {
    data,
    error,
    loading: data === null && error === null,
    syncing,
    sync,
    setEpicStarred,
    dismissError,
  };
}
