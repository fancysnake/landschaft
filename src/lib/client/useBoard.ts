import { useCallback, useEffect, useRef, useState } from "react";

import type { BoardQuery } from "../schema";

import { api, type BoardResponse, errorMessage } from "./api";
import { SYNCED } from "./useSyncStatus";

export interface BoardController {
  data: BoardResponse | null;
  error: string | null;
  loading: boolean;
  setEpicStarred(epic: string, starred: boolean): Promise<void>;
  dismissError(): void;
}

/** Loads the board for the current query, and again whenever a sync lands. */
export function useBoard(dashboardId: string, query: BoardQuery): BoardController {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(-1);
  // Read at request time, so a reload after a slow write uses the query current by then.
  const queryRef = useRef(query);
  const loadSeq = useRef(0);

  /** Loads the board; a response is dropped once a newer load has started. */
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const response = await api.board(dashboardId, queryRef.current);
      if (seq !== loadSeq.current) return;
      versionRef.current = response.status.version;
      setData(response);
      setError(null);
    } catch (cause) {
      if (seq === loadSeq.current) setError(errorMessage(cause));
    }
  }, [dashboardId]);

  useEffect(() => {
    queryRef.current = query;
    void load();
  }, [load, query]);

  useEffect(() => {
    const onSynced = (event: Event) => {
      if ((event as CustomEvent<number>).detail !== versionRef.current) void load();
    };
    window.addEventListener(SYNCED, onSynced);
    return () => window.removeEventListener(SYNCED, onSynced);
  }, [load]);

  const setEpicStarred = useCallback(
    async (epic: string, starred: boolean) => {
      let failure: string | null = null;
      try {
        await api.setEpicStarred(dashboardId, { epic, starred });
      } catch (cause) {
        failure = `Starring epic failed: ${errorMessage(cause)}`;
      }
      await load();
      // After the reload, which clears the error on success.
      if (failure) setError(failure);
    },
    [dashboardId, load],
  );

  const dismissError = useCallback(() => setError(null), []);

  return { data, error, loading: data === null && error === null, setEpicStarred, dismissError };
}
