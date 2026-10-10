import { useCallback, useState } from "react";

const HIDDEN_KEY = "landschaft:hiddenRepos";

/** Repos turned off on any board, shared by every board in this browser. */
export function useHiddenRepos(): [string[], (hidden: string[]) => void] {
  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      return localStorage.getItem(HIDDEN_KEY)?.split(",").filter(Boolean) ?? [];
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
