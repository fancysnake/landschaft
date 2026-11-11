import { useCallback, useEffect, useRef, useState } from "react";

import type { SyncStatus } from "../pacts/sync";
import type { SyncRequest } from "../pacts/web";

import { api, errorMessage } from "./api";

const POLL_MS = 4000;
/** Tells the boards on this page that synced data landed; `detail` is the new version. */
export const SYNCED = "landschaft:synced";
const RESTARTED = "Sync interrupted: the server restarted";

export interface SyncController {
  status: SyncStatus | null;
  error: string | null;
  syncing: boolean;
  /** Queues `repos`, or every configured repo, one at a time on the server. */
  sync(request?: Partial<SyncRequest>): Promise<void>;
  dismissError(): void;
}

/** Polls the sync version, announces each change as {@link SYNCED}, and syncs on demand. */
export function useSyncStatus(): SyncController {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const versionRef = useRef<number | null>(null);
  // The run sync() joined, on the server that answered. The first status that counts the run
  // reports its errors; a status from another server reports the run as interrupted.
  const awaited = useRef<{ boot: string; run: number } | null>(null);

  const apply = useCallback((next: SyncStatus) => {
    setStatus(next);
    if (versionRef.current !== null && next.version !== versionRef.current) {
      window.dispatchEvent(new CustomEvent(SYNCED, { detail: next.version }));
    }
    versionRef.current = next.version;
    const wait = awaited.current;
    if (wait && (next.boot !== wait.boot || next.runs >= wait.run)) {
      awaited.current = null;
      setSyncing(false);
      setError(next.boot === wait.boot ? next.lastError : RESTARTED);
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      apply(await api.version());
    } catch {
      // transient; the next tick retries
    }
  }, [apply]);

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
    async (request: Parameters<SyncController["sync"]>[0] = {}) => {
      setSyncing(true);
      setError(null);
      try {
        const response = await api.sync(request);
        const { boot } = response.status;
        // Responses can land out of order; wait for the newest run any of them joined.
        const joined = awaited.current?.boot === boot ? awaited.current.run : 0;
        awaited.current = { boot, run: Math.max(joined, response.run) };
        apply(response.status);
      } catch (cause) {
        setError(`Sync failed: ${errorMessage(cause)}`);
      }
      if (awaited.current === null) setSyncing(false);
    },
    [apply],
  );

  const dismissError = useCallback(() => setError(null), []);

  return { status, error, syncing, sync, dismissError };
}
