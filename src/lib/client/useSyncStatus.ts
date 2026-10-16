import { useCallback, useEffect, useRef, useState } from "react";

import type { SyncStatus } from "../types";

import { api, errorMessage } from "./api";

const POLL_MS = 4000;
/** Tells the boards on this page that synced data landed; `detail` is the new version. */
export const SYNCED = "landschaft:synced";

export interface SyncController {
  status: SyncStatus | null;
  error: string | null;
  syncing: boolean;
  sync(full?: boolean): Promise<void>;
  dismissError(): void;
}

/** Polls the sync version, announces each change as {@link SYNCED}, and syncs on demand. */
export function useSyncStatus(): SyncController {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const versionRef = useRef<number | null>(null);
  // Set by sync(); the first poll with nothing in flight reports that sync's error, if any.
  const awaitingSync = useRef(false);

  const poll = useCallback(async () => {
    try {
      const next = await api.version();
      setStatus(next);
      if (versionRef.current !== null && next.version !== versionRef.current) {
        window.dispatchEvent(new CustomEvent(SYNCED, { detail: next.version }));
      }
      versionRef.current = next.version;
      if (awaitingSync.current && next.inFlight.length === 0) {
        awaitingSync.current = false;
        setError(next.lastError);
      }
    } catch {
      // transient; the next tick retries
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) void poll();
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [poll]);

  const sync = useCallback(
    async (full = false) => {
      setSyncing(true);
      setError(null);
      try {
        await api.sync({ full });
        awaitingSync.current = true;
      } catch (cause) {
        setError(`Sync failed: ${errorMessage(cause)}`);
      } finally {
        setSyncing(false);
      }
      await poll();
    },
    [poll],
  );

  const dismissError = useCallback(() => setError(null), []);

  return { status, error, syncing, sync, dismissError };
}
