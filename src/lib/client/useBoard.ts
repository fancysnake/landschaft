import { useCallback } from "react";

import type { Filters } from "../pacts/schema";

import { api, type BoardResponse } from "./api";
import { useSynced } from "./useSynced";

export interface BoardController {
  data: BoardResponse | null;
  error: string | null;
  dismissError(): void;
}

/** Loads the board for the current filters, and again whenever a sync lands. */
export function useBoard(dashboardId: string, filters: Filters): BoardController {
  const get = useCallback(() => api.board(dashboardId, filters), [dashboardId, filters]);
  const { data, error, setError } = useSynced(get);
  const dismissError = useCallback(() => setError(null), [setError]);

  return { data, error, dismissError };
}
