export interface SyncState {
  repo: string;
  lastSyncAt: string | null;
  lastFullSyncAt: string | null;
  lastError: string | null;
  /** When the last sync started, whether it succeeded or not. */
  lastAttemptAt: string | null;
}

/** Refresh intervals elapsed since `since`; infinitely many when null. */
export function syncIntervals(since: string | null, refreshMinutes: number, now: number): number {
  if (!since) return Infinity;
  return (now - Date.parse(since)) / (refreshMinutes * 60_000);
}

export interface SyncStatus {
  version: number;
  /** Sync-all runs finished since the server started. */
  runs: number;
  lastSyncAt: string | null;
  /** Every failure of the last run a user asked for, then why the scheduler cannot pick a repo. */
  lastError: string | null;
  rateRemaining: number | null;
  inFlight: string[];
  /** Repos the running sync-all has yet to reach. */
  queued: string[];
  /** Each repo with a sync state: its last successful sync, and its last attempt's error. */
  repos: Record<string, Pick<SyncState, "lastSyncAt" | "lastError">>;
  /** Login the token belongs to; what `@me` in a dashboard's users stands for. */
  viewer: string | null;
}
