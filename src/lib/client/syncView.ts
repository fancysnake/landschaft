import { type SyncStatus, syncIntervals } from "../pacts/sync";
import { relativeTime } from "./labels";

export type SyncAge = "fresh" | "late" | "stale";

/**
 * Fresh within two refresh intervals (the scheduler and a sequential run add delay), late within
 * six, stale after that or never synced.
 */
export function syncAge(iso: string | null, refreshMinutes: number, now: number): SyncAge {
  const intervals = syncIntervals(iso, refreshMinutes, now);
  return intervals <= 2 ? "fresh" : intervals <= 6 ? "late" : "stale";
}

/** The failures to show for `repos`: the status's own, then each repo's it does not carry. */
export function syncErrors(status: SyncStatus, repos: string[]): string[] {
  const { lastError } = status;
  const failed = repos.flatMap((repo) => {
    const error = status.repos[repo]?.lastError;
    return error ? [`${repo}: ${error}`] : [];
  });
  return lastError
    ? [lastError, ...failed.filter((failure) => !lastError.includes(failure))]
    : failed;
}

export type SyncPhase = "idle" | "syncing" | "queued";

/** How the last sync went: its failure, else its age. */
export type SyncHealth = "failed" | SyncAge;

export interface RepoSyncView {
  phase: SyncPhase;
  health: SyncHealth;
  /** The sync button's label: the phase, then the last sync's time or error. */
  label: string;
}

const SYNC_LABEL: Record<SyncPhase, (repo: string) => string> = {
  idle: (repo) => `Sync ${repo}`,
  syncing: (repo) => `Syncing ${repo}`,
  queued: (repo) => `${repo} is queued`,
};

export function repoSyncView(
  repo: string,
  status: SyncStatus | null,
  refreshMinutes: number,
  now: number,
): RepoSyncView {
  const lastSyncAt = status?.repos[repo]?.lastSyncAt ?? null;
  const error = status?.repos[repo]?.lastError;
  const phase: SyncPhase = status?.inFlight.includes(repo)
    ? "syncing"
    : status?.queued.includes(repo)
      ? "queued"
      : "idle";
  const health = error ? "failed" : syncAge(lastSyncAt, refreshMinutes, now);
  const synced = error ? `last sync failed: ${error}` : `synced ${relativeTime(lastSyncAt, now)}`;
  return { phase, health, label: `${SYNC_LABEL[phase](repo)} (${synced})` };
}
