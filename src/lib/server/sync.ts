import type { Config } from "../schema";
import type { Issue, SyncStatus } from "../types";
import type { Db } from "./db";

import { refreshMinutesByRepo } from "./config";
import {
  fetchIssue,
  fetchIssuesPage,
  fetchRepoLabels,
  fetchViewer,
  type GithubClient,
} from "./github";

const FULL_SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SINCE_OVERLAP_MS = 2 * 60 * 1000;
const RATE_FLOOR = 200;

export interface SyncDeps {
  db: Db;
  gh: GithubClient;
  now?: () => Date;
}

export interface SyncResult {
  repo: string;
  full: boolean;
  upserted: number;
  closed: number;
}

export class SyncBusyError extends Error {
  constructor(repo: string) {
    super(`${repo}: sync already running`);
    this.name = "SyncBusyError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class Syncer {
  version = 0;
  lastSyncAt: string | null = null;
  lastError: string | null = null;
  rateRemaining: number | null = null;
  viewerLogin: string | null = null;
  readonly inFlight = new Set<string>();
  readonly db: Db;
  private readonly gh: GithubClient;
  private readonly now: () => Date;
  private viewerPromise: Promise<string> | null = null;

  constructor(deps: SyncDeps) {
    this.db = deps.db;
    this.gh = deps.gh;
    this.now = deps.now ?? (() => new Date());
  }

  bump(): void {
    this.version += 1;
  }

  status(): SyncStatus {
    return {
      version: this.version,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      rateRemaining: this.rateRemaining,
      inFlight: [...this.inFlight],
      viewer: this.viewerLogin,
    };
  }

  /** Login behind the token, fetched once; a failure is retried on the next call. */
  viewer(): Promise<string> {
    this.viewerPromise ??= fetchViewer(this.gh).then(
      (login) => {
        this.viewerLogin = login;
        return login;
      },
      (error: unknown) => {
        this.viewerPromise = null;
        throw error;
      },
    );
    return this.viewerPromise;
  }

  /** Sequential; a failing repo is recorded and skipped, the rest still sync. */
  async syncAll(repos: string[], options: { full?: boolean } = {}): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const repo of repos) {
      if (this.inFlight.has(repo)) continue;
      try {
        results.push(await this.syncRepo(repo, options));
      } catch {
        // recorded in sync_state and lastError by syncRepo
      }
    }
    return results;
  }

  async syncRepo(repo: string, options: { full?: boolean } = {}): Promise<SyncResult> {
    if (this.inFlight.has(repo)) throw new SyncBusyError(repo);
    this.inFlight.add(repo);
    const startedAt = this.now();
    try {
      const state = this.db.getSyncState(repo);
      const fullAge = state?.lastFullSyncAt
        ? startedAt.getTime() - Date.parse(state.lastFullSyncAt)
        : Number.POSITIVE_INFINITY;
      const full = Boolean(options.full) || !state?.lastSyncAt || fullAge > FULL_SYNC_MAX_AGE_MS;
      const since =
        full || !state?.lastSyncAt
          ? null
          : new Date(Date.parse(state.lastSyncAt) - SINCE_OVERLAP_MS).toISOString();

      const seen = new Set<number>();
      let upserted = 0;
      let after: string | null = null;
      do {
        const page = await fetchIssuesPage(this.gh, repo, {
          since,
          states: full ? ["OPEN"] : null,
          after,
        });
        this.rateRemaining = page.rateRemaining;
        this.db.upsertIssues(page.issues);
        upserted += page.issues.length;
        for (const issue of page.issues) seen.add(issue.number);
        after = page.hasNextPage ? page.endCursor : null;
        if (after && page.rateRemaining < RATE_FLOOR) {
          throw new Error(
            `GitHub rate limit nearly exhausted (${page.rateRemaining} left), sync aborted`,
          );
        }
      } while (after);

      const closed = full ? this.db.closeMissing(repo, seen) : 0;
      this.db.upsertLabels(repo, await fetchRepoLabels(this.gh, repo));

      const stamp = startedAt.toISOString();
      this.db.setSyncState(repo, {
        lastSyncAt: stamp,
        lastFullSyncAt: full ? stamp : (state?.lastFullSyncAt ?? null),
        lastError: null,
        updatedAt: this.now().toISOString(),
      });
      this.lastSyncAt = stamp;
      this.lastError = null;
      return { repo, full, upserted, closed };
    } catch (error) {
      const message = errorMessage(error);
      this.db.setSyncState(repo, { lastError: message, updatedAt: this.now().toISOString() });
      this.lastError = `${repo}: ${message}`;
      throw error;
    } finally {
      this.inFlight.delete(repo);
      this.bump();
    }
  }

  async syncIssue(repo: string, number: number): Promise<Issue | null> {
    const issue = await fetchIssue(this.gh, repo, number);
    if (issue) this.db.upsertIssues([issue]);
    this.bump();
    return issue;
  }
}

/**
 * Every tick, syncs each configured repo whose last sync is older than the smallest
 * refreshMinutes among the dashboards using it. Re-reads the config each tick, so
 * settings changes apply without a restart. Returns a stop function.
 */
export function startScheduler(
  syncer: Syncer,
  getConfig: () => Config,
  options: { tickMs?: number; firstDelayMs?: number } = {},
): () => void {
  const tickMs = options.tickMs ?? 60_000;
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    let config: Config;
    try {
      config = getConfig();
    } catch (error) {
      syncer.lastError = `config: ${errorMessage(error)}`;
      return;
    }
    for (const [repo, minutes] of refreshMinutesByRepo(config)) {
      if (stopped || syncer.inFlight.has(repo)) continue;
      const state = syncer.db.getSyncState(repo);
      const due =
        !state?.lastSyncAt || Date.now() - Date.parse(state.lastSyncAt) >= minutes * 60_000;
      if (!due) continue;
      await syncer.syncRepo(repo).catch(() => undefined);
    }
  };
  const first = setTimeout(() => void tick(), options.firstDelayMs ?? 1000);
  const interval = setInterval(() => void tick(), tickMs);
  first.unref();
  interval.unref();
  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(interval);
  };
}
