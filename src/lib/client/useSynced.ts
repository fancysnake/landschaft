import { useCallback, useEffect, useRef, useState } from "react";

import type { SyncStatus } from "../types";

import { errorMessage } from "./api";
import { SYNCED } from "./useSyncStatus";

export interface SyncedController<T> {
  data: T | null;
  error: string | null;
  setError(error: string | null): void;
  load(): Promise<void>;
}

/** Loads with `get` whenever it changes, and again whenever a sync lands. */
export function useSynced<T extends { status: SyncStatus }>(
  get: () => Promise<T>,
): SyncedController<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(-1);
  // Read at request time, so a reload after a slow write uses the `get` current by then.
  const getRef = useRef(get);
  const loadSeq = useRef(0);

  /** A response is dropped once a newer load has started. */
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const response = await getRef.current();
      if (seq !== loadSeq.current) return;
      versionRef.current = response.status.version;
      setData(response);
      setError(null);
    } catch (cause) {
      if (seq === loadSeq.current) setError(errorMessage(cause));
    }
  }, []);

  useEffect(() => {
    getRef.current = get;
    void load();
  }, [load, get]);

  useEffect(() => {
    const onSynced = (event: Event) => {
      if ((event as CustomEvent<number>).detail !== versionRef.current) void load();
    };
    window.addEventListener(SYNCED, onSynced);
    return () => window.removeEventListener(SYNCED, onSynced);
  }, [load]);

  return { data, error, setError, load };
}
