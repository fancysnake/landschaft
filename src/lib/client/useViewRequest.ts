import { useUrlFilters } from "./useUrlFilters";

/** A dashboard view's URL filters, which are its query. */
export function useViewRequest() {
  const [filters, updateFilters] = useUrlFilters();
  return { filters, updateFilters };
}

export type ViewRequest = ReturnType<typeof useViewRequest>;
