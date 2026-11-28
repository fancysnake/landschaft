import type { Config } from "./config";

export interface SyncState {
  repo: string;
  /** The backend the repo's cached rows came from; null while no sync has recorded one. */
  backend: Config["backend"] | null;
  lastSyncAt: string | null;
  lastFullSyncAt: string | null;
  /** The closed window, in days, the cache was last filled for; null before the first fill. */
  filledClosedDays: number | null;
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
  /** Id the server picked at start; a new one means `version` and `runs` began again at zero. */
  boot: string;
  /** Sync-all runs finished since the server started. */
  runs: number;
  /** Counts the statuses this server has given out; of two, the higher is the newer. */
  seq: number;
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
