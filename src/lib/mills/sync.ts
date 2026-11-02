import type { SyncStore } from "../pacts/db";
import type { CiJob } from "../pacts/issues";
import type { SyncStatus } from "../pacts/sync";

import { closedSince, type Config, type Dashboard } from "../pacts/config";
import {
  CI_BATCH,
  type CiBranch,
  type Forge,
  type PageOptions,
  STATUS_BATCH,
} from "../pacts/forge";
import {
  InvalidError,
  SyncBusyError,
  type SyncOptions,
  type SyncResult,
  type SyncService,
} from "../pacts/services";
import { FULL_SYNC_MAX_AGE_MS, RATE_FLOOR, SINCE_OVERLAP_MS } from "../specs";

export interface SyncDeps {
  db: SyncStore;
  forge: Forge;
  /** Read on every use, so settings changes apply without a restart. */
  config: () => Config;
  now?: () => Date;
}

/** The longest window any dashboard shows closed items for, in days; what a full sync fetches. */
export const closedDays = (config: { dashboards: Pick<Dashboard, "closedDays">[] }): number =>
  Math.max(0, ...config.dashboards.map((dashboard) => dashboard.closedDays));

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class Syncer implements SyncService {
  version = 0;
  /** Sync-all runs finished. */
  runs = 0;
  lastSyncAt: string | null = null;
  /** Written by sync-all runs alone; a repo's own error stays in its sync state. */
  private lastError: string | null = null;
  rateRemaining: number | null = null;
  viewerLogin: string | null = null;
  private readonly inFlight = new Set<string>();
  private readonly db: SyncStore;
  private readonly forge: Forge;
  private readonly config: () => Config;
  private readonly now: () => Date;
  private viewerPromise: Promise<string> | null = null;
  /** Repos the running sync-all has yet to reach, each with its `full` flag. */
  private readonly queue = new Map<string, boolean>();
  private running: Promise<void> | null = null;

  constructor(deps: SyncDeps) {
    this.db = deps.db;
    this.forge = deps.forge;
    this.config = deps.config;
    this.now = deps.now ?? (() => new Date());
  }

  status(): SyncStatus {
    return {
      version: this.version,
      runs: this.runs,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      rateRemaining: this.rateRemaining,
      inFlight: [...this.inFlight],
      repos: Object.fromEntries(
        this.db
          .listSyncStates()
          .map(({ repo, lastSyncAt, lastError }) => [repo, { lastSyncAt, lastError }]),
      ),
      viewer: this.viewerLogin,
    };
  }

  /** Login behind the token, fetched once; a failure is retried on the next call. */
  viewer(): Promise<string> {
    this.viewerPromise ??= this.forge.viewer().then(
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

  /**
   * Adds `repos` to the running sync-all, or starts one; resolves when that run ends. A run
   * syncs one repo at a time, skips those already in flight, and ends with every failure it met
   * in `lastError`. Never rejects.
   */
  syncAll(repos: string[], options: SyncOptions = {}): Promise<void> {
    for (const repo of repos) {
      this.queue.set(repo, Boolean(options.full) || Boolean(this.queue.get(repo)));
    }
    // Deferred a tick, so a run that finds the queue empty ends after `running` is set.
    this.running ??= Promise.resolve().then(() => this.drainQueue());
    return this.running;
  }

  start(repos?: string[], options: SyncOptions = {}): void {
    const configured = this.config().repos;
    const unknown = repos?.filter((repo) => !configured.includes(repo)) ?? [];
    if (unknown.length > 0) throw new InvalidError(`not configured: ${unknown.join(", ")}`);
    void this.syncAll(repos ?? configured, options);
  }

  async syncDue(): Promise<void> {
    let config: Config;
    try {
      config = this.config();
    } catch (error) {
      this.lastError = `config: ${errorMessage(error)}`;
      return;
    }
    const now = this.now().getTime();
    const due = config.repos.filter((repo) => {
      if (this.inFlight.has(repo)) return false;
      const lastSyncAt = this.db.getSyncState(repo)?.lastSyncAt;
      return !lastSyncAt || now - Date.parse(lastSyncAt) >= config.refreshMinutes * 60_000;
    });
    if (due.length > 0) await this.syncAll(due);
  }

  /** The sync-all run a `syncAll` call starts or joins now; it ends once `runs` reaches it. */
  get currentRun(): number {
    return this.runs + 1;
  }

  private async drainQueue(): Promise<void> {
    const errors: string[] = [];
    try {
      // A Map iterator also visits the repos added while the run goes.
      for (const [repo, full] of this.queue) {
        this.queue.delete(repo);
        if (this.inFlight.has(repo)) continue;
        try {
          await this.syncRepo(repo, { full });
        } catch (error) {
          errors.push(`${repo}: ${errorMessage(error)}`);
        }
      }
    } finally {
      this.lastError = errors.length > 0 ? errors.join("; ") : null;
      this.runs += 1;
      this.running = null;
    }
  }

  async syncRepo(repo: string, options: SyncOptions = {}): Promise<SyncResult> {
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
      const query: Omit<PageOptions, "after"> = { since, states: full ? "open" : "all" };
      let upserted = 0;
      const cutoff = closedSince(full ? closedDays(this.config()) : 0, startedAt);
      const closedFrom = Number.isFinite(cutoff) ? new Date(cutoff).toISOString() : null;
      const fetchers: Forge["issuesPage"][] = [
        (r, o) => this.forge.issuesPage(r, o),
        (r, o) => this.forge.pullsPage(r, o),
      ];
      for (const fetchPage of fetchers) {
        upserted += await this.drain(fetchPage, repo, query, seen);
        // An open-only full sync misses what closed lately, which boards still show.
        if (closedFrom) {
          upserted += await this.drain(
            fetchPage,
            repo,
            { since: closedFrom, states: "closed" },
            seen,
          );
        }
      }

      const closed = full ? this.db.closeMissing(repo, seen) : 0;
      await this.refreshPullStatuses(repo);
      await this.refreshCiJobs(repo);
      this.db.upsertLabels(repo, await this.forge.repoLabels(repo));

      const stamp = startedAt.toISOString();
      this.db.setSyncState(repo, {
        lastSyncAt: stamp,
        lastFullSyncAt: full ? stamp : (state?.lastFullSyncAt ?? null),
        lastError: null,
        updatedAt: this.now().toISOString(),
      });
      this.lastSyncAt = stamp;
      return { repo, full, upserted, closed };
    } catch (error) {
      this.db.setSyncState(repo, {
        lastError: errorMessage(error),
        updatedAt: this.now().toISOString(),
      });
      throw error;
    } finally {
      this.inFlight.delete(repo);
      this.version += 1;
    }
  }

  /**
   * Upserts every page `fetchPage` returns, adding the numbers to `seen`; stops short when
   * the rate limit runs low. Returns how many issues it upserted.
   */
  private async drain(
    fetchPage: Forge["issuesPage"],
    repo: string,
    query: Omit<PageOptions, "after">,
    seen: Set<number>,
  ): Promise<number> {
    let upserted = 0;
    let after: string | null = null;
    do {
      const page = await fetchPage(repo, { ...query, after });
      this.db.upsertIssues(page.issues);
      upserted += page.issues.length;
      for (const issue of page.issues) seen.add(issue.number);
      after = page.hasNextPage ? page.endCursor : null;
      this.spend(page.rateRemaining, Boolean(after));
    } while (after);
    return upserted;
  }

  /** Stores the statuses of every open PR in the cache, `STATUS_BATCH` PRs per query. */
  private async refreshPullStatuses(repo: string): Promise<void> {
    const numbers = this.db.openPullNumbers(repo);
    for (let start = 0; start < numbers.length; start += STATUS_BATCH) {
      const batch = numbers.slice(start, start + STATUS_BATCH);
      const page = await this.forge.pullStatuses(repo, batch);
      this.db.setPullStatuses(repo, page.statuses);
      this.spend(page.rateRemaining, start + STATUS_BATCH < numbers.length);
    }
  }

  /**
   * Replaces the cached failed CI jobs: lists the branches whose head commit failed and the
   * default branch, then reads jobs and commit authors of those alone, `CI_BATCH` per query. A
   * branch a query failed on keeps its cached jobs.
   */
  private async refreshCiJobs(repo: string): Promise<void> {
    const watched: CiBranch[] = [];
    let after: string | null = null;
    do {
      const page = await this.forge.ciBranchesPage(repo, after);
      watched.push(...page.branches);
      after = page.hasNextPage ? page.endCursor : null;
      this.spend(page.rateRemaining, Boolean(after) || watched.length > 0);
    } while (after);
    const jobs: CiJob[] = [];
    const failed = new Set<string>();
    for (let start = 0; start < watched.length; start += CI_BATCH) {
      const batch = watched.slice(start, start + CI_BATCH);
      const page = await this.forge.ciJobs(repo, batch);
      jobs.push(...page.jobs);
      for (const name of page.failed) failed.add(name);
      this.spend(page.rateRemaining, start + CI_BATCH < watched.length);
    }
    jobs.push(...this.db.listCiJobs([repo]).filter((job) => failed.has(job.branch)));
    this.db.setCiJobs(repo, jobs);
  }

  /** Records the rate limit left; aborts the sync when it runs low and `more` requests follow. */
  private spend(rateRemaining: number, more: boolean): void {
    this.rateRemaining = rateRemaining;
    if (more && rateRemaining < RATE_FLOOR) {
      throw new Error(`GitHub rate limit nearly exhausted (${rateRemaining} left), sync aborted`);
    }
  }
}
