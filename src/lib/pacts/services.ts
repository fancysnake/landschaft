import type { BoardDashboard, Config, InboxDashboard } from "./config";
import type { Offer } from "./filter";
import type { LabelDef } from "./issues";
import type { SyncStatus } from "./sync";
import type { Board, Card, Filters, Inbox, NavData, UnmatchedQuery } from "./views";

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
  /**
   * Validates and saves `config` with the stored `hiddenRepos`, which `setHidden` owns, then
   * fully resyncs the repos it widened.
   */
  save(config: unknown): Config;
  /** Switches `repos` off or on. Throws `InvalidError` for a repo outside the config. */
  setHidden(repos: string[], hidden: boolean): Config;
}

export interface SyncService {
  status(): SyncStatus;
  /** Throws `SyncBusyError` when `repo` is already syncing. */
  syncRepo(repo: string, options?: SyncOptions): Promise<SyncResult>;
  /** Adds `repos` to the running sync-all, or starts one; resolves when it ends. Never rejects. */
  syncAll(repos: string[], options?: SyncOptions): Promise<void>;
  /**
   * Queues `repos`, or every configured repo, onto a sync-all without waiting for it, and returns
   * that run's number; it ends once `runs` reaches it. Throws `InvalidError` for a repo outside
   * the config.
   */
  start(repos?: string[], options?: SyncOptions): number;
  /** Syncs the configured repos whose last sync is older than the refresh interval. Never rejects. */
  syncDue(): Promise<void>;
}

export interface ViewService {
  nav(): Promise<NavData>;
  /** Throws `NotFoundError` unless `id` names a board. */
  board(
    id: string,
    filters: Filters,
  ): Promise<{ dashboard: BoardDashboard; board: Board; status: SyncStatus }>;
  /** Throws `NotFoundError` unless `id` names an inbox. */
  inbox(
    id: string,
    filters: Filters,
  ): Promise<{ dashboard: InboxDashboard; inbox: Inbox; status: SyncStatus }>;
  unmatched(query: UnmatchedQuery): Promise<{ items: Card[]; offer: Offer; status: SyncStatus }>;
  labels(repos: string[]): LabelDef[];
  /**
   * Stars or unstars `epic` on dashboard `id`; returns its starred epics. Throws `NotFoundError`
   * for an unknown dashboard and `InvalidError` for an epic outside the configured repos.
   */
  starEpic(id: string, epic: string, starred: boolean): string[];
}

/** What every request reaches the app through, as `locals.services`. */
export interface Services {
  config: ConfigService;
  sync: SyncService;
  views: ViewService;
}
