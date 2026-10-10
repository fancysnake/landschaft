import { useSyncExternalStore } from "react";

const HIDDEN_KEY = "landschaft:hiddenRepos";
/** Tells the other islands on this page; `storage` only reaches other tabs. */
const CHANGED = "landschaft:hiddenRepos";
const NONE: string[] = [];

/** Stands in for blocked storage, so a choice lasts until a reload. */
let memory: string | null = null;
let cache: { raw: string | null; hidden: string[] } | null = null;

function read(): string[] {
  let raw = memory;
  try {
    raw = localStorage.getItem(HIDDEN_KEY);
  } catch {
    // storage blocked: read the stand-in
  }
  // Same array for the same value, as useSyncExternalStore requires.
  if (cache?.raw !== raw) cache = { raw, hidden: raw?.split(",").filter(Boolean) ?? NONE };
  return cache.hidden;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function setHidden(hidden: string[]): void {
  try {
    localStorage.setItem(HIDDEN_KEY, hidden.join(","));
  } catch {
    memory = hidden.join(",");
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Repos switched off in the nav, shared by every board in this browser. */
export function useHiddenRepos(): [string[], (hidden: string[]) => void] {
  return [useSyncExternalStore(subscribe, read, () => NONE), setHidden];
}
