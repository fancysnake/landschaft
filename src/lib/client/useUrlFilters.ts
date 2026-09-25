import { useCallback, useState } from "react";

import type { Filters } from "../schema";

import { filtersToQuery } from "./api";

const TEXT_KEYS = ["q", "assignee", "label", "epic"] as const;

export function readFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  const filters: Filters = {};
  for (const key of TEXT_KEYS) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  const sort = params.get("sort");
  if (sort === "created" || sort === "updated") filters.sort = sort;
  const dir = params.get("dir");
  if (dir === "asc" || dir === "desc") filters.dir = dir;
  return filters;
}

/** Filters mirrored into the query string, so a board view is a shareable URL. */
export function useUrlFilters(): [Filters, (patch: Partial<Filters>) => void] {
  const [filters, setFilters] = useState<Filters>(() => readFilters(window.location.search));
  const update = useCallback((patch: Partial<Filters>) => {
    setFilters((previous) => {
      const next = readFilters(filtersToQuery({ ...previous, ...patch }));
      const query = filtersToQuery(next);
      window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
      return next;
    });
  }, []);
  return [filters, update];
}
