import { useCallback, useEffect, useRef, useState } from "react";

import type { BoardQuery } from "../schema";

import { api, type BoardResponse, errorMessage } from "./api";

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

/** Loads the board for the current query, polls the sync version. */
export function useBoard(dashboardId: string, filters: BoardQuery): BoardController {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const versionRef = useRef(-1);
  // Read at request time, so a reload after a slow write uses the filters current by then.
  const filtersRef = useRef(filters);
  const loadSeq = useRef(0);

  /** Loads the board; a response is dropped once a newer load has started. */
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const response = await api.board(dashboardId, filtersRef.current);
      if (seq !== loadSeq.current) return;
      versionRef.current = response.status.version;
      setData(response);
      setError(null);
    } catch (cause) {
      if (seq === loadSeq.current) setError(errorMessage(cause));
    }
  }, [dashboardId]);

  useEffect(() => {
    filtersRef.current = filters;
    void load();
  }, [load, filters]);

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
