import { useCallback } from "react";

import type { ViewQuery } from "../schema";

import { api, type BoardResponse, errorMessage } from "./api";
import { useSynced } from "./useSynced";

export interface BoardController {
  data: BoardResponse | null;
  error: string | null;
  setEpicStarred(epic: string, starred: boolean): Promise<void>;
  dismissError(): void;
}

/** Loads the board for the current query, and again whenever a sync lands. */
export function useBoard(dashboardId: string, query: ViewQuery): BoardController {
  const get = useCallback(() => api.board(dashboardId, query), [dashboardId, query]);
  const { data, error, setError, load } = useSynced(get);

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
    [dashboardId, load, setError],
  );

  const dismissError = useCallback(() => setError(null), [setError]);

  return { data, error, setEpicStarred, dismissError };
}
