import type { CiJob, FetchedIssue, LabelDef, PullStatus, Snapshot, SyncState } from "./types";

/** The cache the sync writes. */
export interface SyncStore {
  getSyncState(repo: string): SyncState | null;
  listSyncStates(): SyncState[];
  setSyncState(repo: string, patch: Partial<Omit<SyncState, "repo">>): void;
  upsertIssues(issues: FetchedIssue[]): void;
  /** After a full sync: anything still open that the forge did not list is closed. */
  closeMissing(repo: string, seen: Set<number>): number;
  openPullNumbers(repo: string): number[];
  setPullStatuses(repo: string, statuses: PullStatus[]): void;
  listCiJobs(repos: string[]): CiJob[];
  setCiJobs(repo: string, jobs: CiJob[]): void;
  upsertLabels(repo: string, labels: Omit<LabelDef, "repo">[]): void;
}

/** The cache the views read, plus the starred epics they keep. */
export interface ViewStore {
  snapshot(repos: string[]): Snapshot;
  listLabels(repos: string[]): LabelDef[];
  starredEpics(dashboard: string): Set<string>;
  setEpicStarred(dashboard: string, epic: string, starred: boolean): void;
}
