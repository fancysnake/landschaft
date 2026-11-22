import type { BoardDashboard, Config, InboxDashboard } from "./config";
import type { Offer } from "./filter";
import type { LabelDef } from "./issues";
import type { SyncStatus } from "./sync";
import type { Board, Card, Filters, Inbox, NavData, UnmatchedQuery } from "./views";
import type { SyncRequest } from "./web";

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Input that parses but makes no sense, e.g. a reference to a repo outside the config. */
export class InvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidError";
  }
}

export class SyncBusyError extends Error {
  constructor(repo: string) {
    super(`${repo}: sync already running`);
    this.name = "SyncBusyError";
  }
}

export interface SyncResult {
  repo: string;
  full: boolean;
  upserted: number;
  closed: number;
}

export interface SyncOptions {
  full?: boolean;
}

export interface ConfigService {
  load(): Config;
  /** Validates and saves `config`, then fully resyncs the repos it widened. */
  save(config: Config): Config;
}

export interface SyncService {
  status(): SyncStatus;
  /** Throws `SyncBusyError` when `repo` is already syncing. */
  syncRepo(repo: string, options?: SyncOptions): Promise<SyncResult>;
  /** Adds `repos` to the running sync-all, or starts one; resolves when it ends. Never rejects. */
  syncAll(repos: string[], options?: SyncOptions): Promise<void>;
  /**
   * Queues `repos`, or every configured repo, onto a sync-all without waiting for it, and returns
   * that run's number; it ends once `runs` reaches it. `stale` leaves out the repos whose last
   * sync succeeded within `FRESH_SYNC_MS`. Throws `InvalidError` for a repo outside the config.
   */
  start(request: SyncRequest): number;
  /**
   * Syncs the stalest repo due, at most once per refresh interval split
   * by the configured repos; skips while a sync runs, and once the last `touch` is older than
   * `IDLE_PAUSE_MS`. Due: last attempt older than the interval.
   * The repo's failure stays in its sync state, out of `lastError`. Never rejects.
   */
  syncDue(): Promise<void>;
  /** Records a request to the site or the API. */
  touch(): void;
}

/**
 * Every view but the nav leaves out the items of the `hidden` repos, the ones the browser
 * switched off.
 */
export interface ViewService {
  nav(): Promise<NavData>;
  /** Throws `NotFoundError` unless `id` names a board. */
  board(
    id: string,
    filters: Filters,
    hidden: string[],
  ): Promise<{ dashboard: BoardDashboard; board: Board; status: SyncStatus }>;
  /** Throws `NotFoundError` unless `id` names an inbox. */
  inbox(
    id: string,
    filters: Filters,
    hidden: string[],
  ): Promise<{ dashboard: InboxDashboard; inbox: Inbox; status: SyncStatus }>;
  unmatched(
    query: UnmatchedQuery,
    hidden: string[],
  ): Promise<{ items: Card[]; offer: Offer; status: SyncStatus }>;
  labels(repos: string[]): LabelDef[];
}

/** What every request reaches the app through, as `locals.services`. */
export interface Services {
  config: ConfigService;
  sync: SyncService;
  views: ViewService;
}
