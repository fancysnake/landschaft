import { useMemo } from "react";

import { useHiddenRepos } from "./useHiddenRepos";
import { useUrlFilters } from "./useUrlFilters";

/** A dashboard view's URL filters and switched-off repos, and the query they make together. */
export function useViewRequest() {
  const [filters, updateFilters] = useUrlFilters();
  const [hidden] = useHiddenRepos();
  const request = useMemo(() => ({ ...filters, hide: hidden }), [filters, hidden]);
  return { filters, updateFilters, hidden, request };
}

export type ViewRequest = ReturnType<typeof useViewRequest>;
