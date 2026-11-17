import type { Config, Dashboard } from "../pacts/config";
import type { SyncStore } from "../pacts/db";
import type { CiJob } from "../pacts/issues";
import type { SyncRequest } from "../pacts/web";

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
import { type SyncState, type SyncStatus, syncIntervals } from "../pacts/sync";
import { FRESH_SYNC_MS, FULL_SYNC_MAX_AGE_MS, RATE_FLOOR, SINCE_OVERLAP_MS } from "../specs";

export interface SyncDeps {
  db: SyncStore;
  forge: Forge;
  /** Read on every use, so settings changes apply without a restart. */
  config: () => Config;
  now?: () => Date;
}

/** The longest window any dashboard shows closed items for, in days; what the cache must hold. */
export const closedDays = (config: { dashboards: Pick<Dashboard, "closedDays">[] }): number =>
  Math.max(0, ...config.dashboards.map((dashboard) => dashboard.closedDays));

const DAY_MS = 24 * 60 * 60 * 1000;

/** The earliest close time, in ms, a window of `days` back from `now` keeps; Infinity for 0. */
export const closedSince = (days: number, now: Date): number =>
  days > 0 ? now.getTime() - days * DAY_MS : Number.POSITIVE_INFINITY;

export interface ClosedPlan {
  /** Where the fetch of closed items starts, as an ISO time; null fetches none. */
  from: string | null;
  /** The window, in days, the cache holds once the sync succeeds. */
  filled: number | null;
}

/**
 * The closed items a sync of a `days` window fetches. The cache holds a `filled` window up to
 * `previous`, the last sync less the overlap, in ms. A `forced` sync, or one that finds the cache
 * lacking the window, fetches the whole window; any other full sync fetches only since `previous`.
 * An incremental sync otherwise fetches closed items with the rest, so it keeps `filled`.
 */
export function closedPlan({
  days,
  now,
  previous,
  filled,
  forced,
  full,
}: {
  days: number;
  now: Date;
  previous: number | null;
  filled: number | null;
  forced: boolean;
  full: boolean;
}): ClosedPlan {
  const refill = forced || filled === null || days > filled;
  if (!refill && !full) return { from: null, filled };
  if (days === 0) return { from: null, filled: 0 };
  const start = closedSince(days, now);
  const from = refill || previous === null ? start : Math.max(start, previous);
  return { from: new Date(from).toISOString(), filled: days };
}

type Schedule = Pick<Config, "repos" | "refreshMinutes">;

/**
 * The repo to sync next: none within a slot of the newest attempt, a slot being the refresh
 * interval split by the repos, else the stalest due repo. Takes attempts rather than successes,
 * so a failing repo waits its turn instead of staying the stalest.
 */
export function nextDue(
  { repos, refreshMinutes }: Schedule,
  attempts: Record<string, string | null>,
  now: number,
): string | undefined {
  const ages = repos.map((repo) => ({
    repo,
    age: syncIntervals(attempts[repo] ?? null, refreshMinutes, now),
  }));
  if (Math.min(...ages.map(({ age }) => age)) < 1 / repos.length) return undefined;
  // Two repos that never synced give Infinity - Infinity, NaN, which keeps config order.
  const due = ages.filter(({ age }) => age >= 1).toSorted((a, b) => b.age - a.age);
  return due[0]?.repo;
}

/**
 * `repos` without a sync that succeeded within `FRESH_SYNC_MS` of `now`. Takes successes, unlike
 * `nextDue`, so a page load retries a failed repo the way Refresh does.
 */
export function staleRepos(repos: string[], states: SyncState[], now: number): string[] {
  const fresh = new Set(
    states
      .filter(
        ({ lastSyncAt, lastError }) =>
          lastSyncAt !== null &&
          lastError === null &&
          now - Date.parse(lastSyncAt) <= FRESH_SYNC_MS,
      )
      .map(({ repo }) => repo),
  );
  return repos.filter((repo) => !fresh.has(repo));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class Syncer implements SyncService {
  private version = 0;
  private readonly boot = crypto.randomUUID();
  /** Sync-all runs finished. */
  private runs = 0;
  private lastSyncAt: string | null = null;
  /**
   * Failures of runs a user asked for, by repo, until that repo syncs or leaves the config. A
   * repo's own error stays in its sync state.
   */
  private readonly userErrors = new Map<string, string>();
  /** Why `syncDue` last failed to pick a repo, until it next picks one. */
  private dueError: string | null = null;
  private rateRemaining: number | null = null;
  private viewerLogin: string | null = null;
  /** Repos syncing now, each with whether a request forced the sync to be full. */
  private readonly inFlight = new Map<string, boolean>();
  private readonly db: SyncStore;
  private readonly forge: Forge;
  private readonly config: () => Config;
  private readonly now: () => Date;
  private viewerPromise: Promise<string> | null = null;
  /** Repos the running sync-all has yet to reach, each with its `full` flag. */
  private readonly queue = new Map<string, boolean>();
  private running: Promise<void> | null = null;
  /** The running sync-all holds a user's repos, so it reports to `userErrors`. */
  private userRun = false;

  constructor(deps: SyncDeps) {
    this.db = deps.db;
    this.forge = deps.forge;
    this.config = deps.config;
    this.now = deps.now ?? (() => new Date());
  }

  status(): SyncStatus {
    return {
      version: this.version,
      boot: this.boot,
      runs: this.runs,
      lastSyncAt: this.lastSyncAt,
      lastError: [...this.userErrors.values(), this.dueError].filter(Boolean).join("; ") || null,
      rateRemaining: this.rateRemaining,
      inFlight: [...this.inFlight.keys()],
      queued: [...this.queue.keys()],
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
   * Adds `repos` to the running sync-all, or starts one; resolves when that run ends. A repo
   * syncing now is left out unless the call asks for a full sync and that sync is incremental.
   * A run syncs one repo at a time and ends with every failure it met in `lastError`, unless
   * only `background` calls fed it; each stays until its repo syncs. Never rejects.
   */
  syncAll(repos: string[], options: SyncOptions & { background?: boolean } = {}): Promise<void> {
    const full = Boolean(options.full);
    for (const repo of repos) {
      if (this.inFlight.has(repo) && (!full || this.inFlight.get(repo))) continue;
      this.queue.set(repo, full || Boolean(this.queue.get(repo)));
    }
    this.userRun ||= !options.background;
    // Deferred a tick, so a run that finds the queue empty ends after `running` is set.
    this.running ??= Promise.resolve().then(() => this.drainQueue());
    return this.running;
  }

  start({ repos, full, stale }: SyncRequest): number {
    const configured = this.config().repos;
    const unknown = repos?.filter((repo) => !configured.includes(repo)) ?? [];
    if (unknown.length > 0) throw new InvalidError(`not configured: ${unknown.join(", ")}`);
    const run = this.runs + 1;
    const wanted = repos ?? configured;
    const queued = stale
      ? staleRepos(wanted, this.db.listSyncStates(), this.now().getTime())
      : wanted;
    void this.syncAll(queued, { full });
    return run;
  }

  async syncDue(): Promise<void> {
    if (this.running || this.inFlight.size > 0) return;
    let config: Config;
    try {
      config = this.config();
    } catch (error) {
      this.dueError = `config: ${errorMessage(error)}`;
      return;
    }
    let repo: string | undefined;
    try {
      const attempts = Object.fromEntries(
        this.db.listSyncStates().map((state) => [state.repo, state.lastAttemptAt]),
      );
      repo = nextDue(config, attempts, this.now().getTime());
    } catch (error) {
      this.dueError = `due repos: ${errorMessage(error)}`;
      return;
    }
    this.dueError = null;
    // No sync will clear a repo gone from the config.
    for (const failed of this.userErrors.keys()) {
      if (!config.repos.includes(failed)) this.userErrors.delete(failed);
    }
    if (repo) await this.syncAll([repo], { background: true });
  }

  private async drainQueue(): Promise<void> {
    const errors = new Map<string, string>();
    try {
      // A Map iterator also visits the repos added while the run goes.
      for (const [repo, full] of this.queue) {
        this.queue.delete(repo);
        if (this.inFlight.has(repo)) continue;
        try {
          await this.syncRepo(repo, { full });
          errors.delete(repo);
        } catch (error) {
          errors.set(repo, `${repo}: ${errorMessage(error)}`);
        }
      }
    } finally {
      if (this.userRun) for (const [repo, error] of errors) this.userErrors.set(repo, error);
      this.userRun = false;
      this.runs += 1;
      this.running = null;
    }
  }

  async syncRepo(repo: string, options: SyncOptions = {}): Promise<SyncResult> {
    if (this.inFlight.has(repo)) throw new SyncBusyError(repo);
    const startedAt = this.now();
    const stamp = startedAt.toISOString();
    try {
      const state = this.db.getSyncState(repo);
      const fullAge = state?.lastFullSyncAt
        ? startedAt.getTime() - Date.parse(state.lastFullSyncAt)
        : Number.POSITIVE_INFINITY;
      const full = Boolean(options.full) || !state?.lastSyncAt || fullAge > FULL_SYNC_MAX_AGE_MS;
      this.inFlight.set(repo, full);
      const previous = state?.lastSyncAt ? Date.parse(state.lastSyncAt) - SINCE_OVERLAP_MS : null;
      const since = full || previous === null ? null : new Date(previous).toISOString();

      const seen = new Set<number>();
      const query: Omit<PageOptions, "after"> = { since, states: full ? "open" : "all" };
      let upserted = 0;
      const plan = closedPlan({
        days: closedDays(this.config()),
        now: startedAt,
        previous,
        filled: state?.filledClosedDays ?? null,
        forced: Boolean(options.full),
        full,
      });
      const fetchers: Forge["issuesPage"][] = [
        (r, o) => this.forge.issuesPage(r, o),
        (r, o) => this.forge.pullsPage(r, o),
      ];
      for (const fetchPage of fetchers) {
        upserted += await this.drain(fetchPage, repo, query, seen);
        // An open-only full sync misses what closed lately, which boards still show.
        if (plan.from) {
          upserted += await this.drain(
            fetchPage,
            repo,
            { since: plan.from, states: "closed" },
            seen,
          );
        }
      }

      const closed = full ? this.db.closeMissing(repo, seen) : 0;
      await this.refreshPullStatuses(repo);
      await this.refreshCiJobs(repo);
      this.db.upsertLabels(repo, await this.forge.repoLabels(repo));

      this.db.setSyncState(repo, {
        lastSyncAt: stamp,
        lastFullSyncAt: full ? stamp : (state?.lastFullSyncAt ?? null),
        filledClosedDays: plan.filled,
        lastError: null,
        lastAttemptAt: stamp,
      });
      this.lastSyncAt = stamp;
      this.userErrors.delete(repo);
      return { repo, full, upserted, closed };
    } catch (error) {
      this.db.setSyncState(repo, {
        lastError: errorMessage(error),
        lastAttemptAt: stamp,
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
