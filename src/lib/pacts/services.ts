import type { Offer } from "./filter";
import type { BoardDashboard, Config, Filters, InboxDashboard, UnmatchedQuery } from "./schema";
import type { Board, Card, Inbox, LabelDef, NavData, SyncStatus } from "./types";

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
  /** The sync-all run a `syncAll` call starts or joins now; it ends once `runs` reaches it. */
  readonly currentRun: number;
}

export interface ViewService {
  nav(): Promise<NavData>;
  /** Throws `NotFoundError` unless `id` names a board. */
  board(
    id: string,
    filters: Filters,
  ): Promise<{ dashboard: BoardDashboard; board: Board; hidden: string[]; status: SyncStatus }>;
  /** Throws `NotFoundError` unless `id` names an inbox. */
  inbox(
    id: string,
    filters: Filters,
  ): Promise<{ dashboard: InboxDashboard; inbox: Inbox; hidden: string[]; status: SyncStatus }>;
  unmatched(
    query: Omit<UnmatchedQuery, "hide">,
  ): Promise<{ items: Card[]; offer: Offer; status: SyncStatus }>;
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
