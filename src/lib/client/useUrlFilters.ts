import { useCallback, useState } from "react";

import { type Filters, parseRepoFilter, TEXT_FILTER_KEYS } from "../schema";
import { filtersToQuery } from "./api";

export function readFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  const filters: Filters = {};
  for (const key of TEXT_FILTER_KEYS) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  const repo = parseRepoFilter(params.get("repo"));
  if (repo) filters.repo = repo;
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
      // Same object for the same query, so effects keyed on filters skip no-op patches.
      if (query === filtersToQuery(previous)) return previous;
      window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
      return next;
    });
  }, []);
  return [filters, update];
}

const HIDDEN_KEY = "landschaft:hiddenRepos";

/** Repos turned off on any board, shared by every board in this browser. */
export function useHiddenRepos(): [string[], (hidden: string[]) => void] {
  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      return parseRepoFilter(localStorage.getItem(HIDDEN_KEY)) ?? [];
    } catch {
      return [];
    }
  });
  const update = useCallback((next: string[]) => {
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, next.join(","));
    } catch {
      // storage blocked: the choice lasts until a reload
    }
  }, []);
  return [hidden, update];
}
