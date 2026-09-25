import { DatabaseSync } from "node:sqlite";

import type { Assignee, Blocker, Issue, IssueState, LabelDef, LabelRef, SyncState } from "../types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS issues (
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  node_id TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL,
  url TEXT NOT NULL,
  issue_type TEXT,
  author TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT,
  labels_json TEXT NOT NULL DEFAULT '[]',
  assignees_json TEXT NOT NULL DEFAULT '[]',
  parent_repo TEXT,
  parent_number INTEGER,
  sub_total INTEGER NOT NULL DEFAULT 0,
  sub_completed INTEGER NOT NULL DEFAULT 0,
  sub_percent INTEGER NOT NULL DEFAULT 0,
  blocked_by_total INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (repo, number)
);
CREATE INDEX IF NOT EXISTS issues_repo_state ON issues (repo, state);
CREATE TABLE IF NOT EXISTS blocked_by (
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  blocker_repo TEXT NOT NULL,
  blocker_number INTEGER NOT NULL,
  blocker_state TEXT NOT NULL,
  PRIMARY KEY (repo, number, blocker_repo, blocker_number)
);
CREATE TABLE IF NOT EXISTS labels (
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT,
  PRIMARY KEY (repo, name)
);
CREATE TABLE IF NOT EXISTS sync_state (
  repo TEXT PRIMARY KEY,
  last_sync_at TEXT,
  last_full_sync_at TEXT,
  last_error TEXT,
  updated_at TEXT
);
`;

interface IssueRow {
  repo: string;
  number: number;
  node_id: string;
  title: string;
  state: string;
  url: string;
  issue_type: string | null;
  author: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  labels_json: string;
  assignees_json: string;
  parent_repo: string | null;
  parent_number: number | null;
  sub_total: number;
  sub_completed: number;
  sub_percent: number;
  blocked_by_total: number;
}

interface BlockerRow {
  repo: string;
  number: number;
  blocker_repo: string;
  blocker_number: number;
  blocker_state: string;
}

interface LabelRow {
  repo: string;
  name: string;
  color: string;
  description: string | null;
}

interface SyncStateRow {
  repo: string;
  last_sync_at: string | null;
  last_full_sync_at: string | null;
  last_error: string | null;
  updated_at: string | null;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function rowToIssue(row: IssueRow, blockedBy: Blocker[]): Issue {
  return {
    repo: row.repo,
    number: row.number,
    nodeId: row.node_id,
    title: row.title,
    state: row.state as IssueState,
    url: row.url,
    issueType: row.issue_type,
    author: row.author,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    labels: JSON.parse(row.labels_json) as LabelRef[],
    assignees: JSON.parse(row.assignees_json) as Assignee[],
    parent:
      row.parent_repo && row.parent_number !== null
        ? { repo: row.parent_repo, number: row.parent_number }
        : null,
    subIssues: { total: row.sub_total, completed: row.sub_completed, percent: row.sub_percent },
    blockedBy,
    blockedByTotal: row.blocked_by_total,
  };
}

export function dbPath(): string {
  return process.env.LANDSCHAFT_DB ?? "landschaft.db";
}

export class Db {
  private readonly db: DatabaseSync;

  constructor(file = dbPath()) {
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec(SCHEMA);
    this.migrate();
  }

  /** Columns added after the first release; a new column forces a full resync to fill it. */
  private migrate(): void {
    const columns = (
      this.db.prepare("PRAGMA table_info(issues)").all() as unknown as { name: string }[]
    ).map((column) => column.name);
    if (!columns.includes("author")) {
      this.db.exec("ALTER TABLE issues ADD COLUMN author TEXT");
      this.db.exec("DELETE FROM sync_state");
    }
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  upsertIssues(issues: Issue[]): void {
    if (issues.length === 0) return;
    const upsert = this.db.prepare(`
      INSERT INTO issues (repo, number, node_id, title, state, url, issue_type, author, created_at,
        updated_at, closed_at, labels_json, assignees_json, parent_repo, parent_number, sub_total,
        sub_completed, sub_percent, blocked_by_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (repo, number) DO UPDATE SET
        node_id = excluded.node_id, title = excluded.title, state = excluded.state, url = excluded.url,
        issue_type = excluded.issue_type, author = excluded.author, created_at = excluded.created_at,
        updated_at = excluded.updated_at, closed_at = excluded.closed_at,
        labels_json = excluded.labels_json, assignees_json = excluded.assignees_json,
        parent_repo = excluded.parent_repo, parent_number = excluded.parent_number,
        sub_total = excluded.sub_total, sub_completed = excluded.sub_completed,
        sub_percent = excluded.sub_percent, blocked_by_total = excluded.blocked_by_total
    `);
    const clearBlockers = this.db.prepare("DELETE FROM blocked_by WHERE repo = ? AND number = ?");
    const insertBlocker = this.db.prepare(
      "INSERT OR REPLACE INTO blocked_by (repo, number, blocker_repo, blocker_number, blocker_state) VALUES (?, ?, ?, ?, ?)",
    );
    this.transaction(() => {
      for (const issue of issues) {
        upsert.run(
          issue.repo,
          issue.number,
          issue.nodeId,
          issue.title,
          issue.state,
          issue.url,
          issue.issueType,
          issue.author,
          issue.createdAt,
          issue.updatedAt,
          issue.closedAt,
          JSON.stringify(issue.labels),
          JSON.stringify(issue.assignees),
          issue.parent?.repo ?? null,
          issue.parent?.number ?? null,
          issue.subIssues.total,
          issue.subIssues.completed,
          issue.subIssues.percent,
          issue.blockedByTotal,
        );
        clearBlockers.run(issue.repo, issue.number);
        for (const blocker of issue.blockedBy) {
          insertBlocker.run(issue.repo, issue.number, blocker.repo, blocker.number, blocker.state);
        }
      }
    });
  }

  getIssue(repo: string, number: number): Issue | null {
    const row = this.db
      .prepare("SELECT * FROM issues WHERE repo = ? AND number = ?")
      .get(repo, number) as IssueRow | undefined;
    if (!row) return null;
    const blockers = this.db
      .prepare("SELECT * FROM blocked_by WHERE repo = ? AND number = ?")
      .all(repo, number) as unknown as BlockerRow[];
    return rowToIssue(
      row,
      blockers.map((b) => ({
        repo: b.blocker_repo,
        number: b.blocker_number,
        state: b.blocker_state as IssueState,
      })),
    );
  }

  /** Every cached issue (any state) for the given repos. */
  listIssues(repos: string[]): Issue[] {
    if (repos.length === 0) return [];
    const rows = this.db
      .prepare(`SELECT * FROM issues WHERE repo IN (${placeholders(repos.length)})`)
      .all(...repos) as unknown as IssueRow[];
    const blockerRows = this.db
      .prepare(`SELECT * FROM blocked_by WHERE repo IN (${placeholders(repos.length)})`)
      .all(...repos) as unknown as BlockerRow[];
    const blockers = new Map<string, Blocker[]>();
    for (const b of blockerRows) {
      const key = `${b.repo}#${b.number}`;
      const list = blockers.get(key) ?? [];
      list.push({
        repo: b.blocker_repo,
        number: b.blocker_number,
        state: b.blocker_state as IssueState,
      });
      blockers.set(key, list);
    }
    return rows.map((row) => rowToIssue(row, blockers.get(`${row.repo}#${row.number}`) ?? []));
  }

  /** After a full sync: anything still OPEN that GitHub did not list is closed. Returns the count. */
  closeMissing(repo: string, seen: Set<number>): number {
    const open = this.db
      .prepare("SELECT number FROM issues WHERE repo = ? AND state = 'OPEN'")
      .all(repo) as unknown as { number: number }[];
    const stale = open.map((r) => r.number).filter((n) => !seen.has(n));
    if (stale.length === 0) return 0;
    const close = this.db.prepare(
      "UPDATE issues SET state = 'CLOSED' WHERE repo = ? AND number = ?",
    );
    this.transaction(() => {
      for (const number of stale) close.run(repo, number);
    });
    return stale.length;
  }

  patchLabels(repo: string, number: number, labels: LabelRef[]): void {
    this.db
      .prepare("UPDATE issues SET labels_json = ? WHERE repo = ? AND number = ?")
      .run(JSON.stringify(labels), repo, number);
  }

  /** Replaces the label catalogue of one repo. */
  upsertLabels(repo: string, labels: Omit<LabelDef, "repo">[]): void {
    const insert = this.db.prepare(
      "INSERT INTO labels (repo, name, color, description) VALUES (?, ?, ?, ?)",
    );
    this.transaction(() => {
      this.db.prepare("DELETE FROM labels WHERE repo = ?").run(repo);
      for (const label of labels) insert.run(repo, label.name, label.color, label.description);
    });
  }

  listLabels(repos: string[]): LabelDef[] {
    if (repos.length === 0) return [];
    const rows = this.db
      .prepare(`SELECT * FROM labels WHERE repo IN (${placeholders(repos.length)}) ORDER BY name`)
      .all(...repos) as unknown as LabelRow[];
    return rows.map((row) => ({
      repo: row.repo,
      name: row.name,
      color: row.color,
      description: row.description,
    }));
  }

  getSyncState(repo: string): SyncState | null {
    const row = this.db.prepare("SELECT * FROM sync_state WHERE repo = ?").get(repo) as
      | SyncStateRow
      | undefined;
    if (!row) return null;
    return {
      repo: row.repo,
      lastSyncAt: row.last_sync_at,
      lastFullSyncAt: row.last_full_sync_at,
      lastError: row.last_error,
      updatedAt: row.updated_at,
    };
  }

  setSyncState(repo: string, patch: Partial<Omit<SyncState, "repo">>): void {
    const current = this.getSyncState(repo) ?? {
      repo,
      lastSyncAt: null,
      lastFullSyncAt: null,
      lastError: null,
      updatedAt: null,
    };
    const next = { ...current, ...patch };
    this.db
      .prepare(
        `INSERT INTO sync_state (repo, last_sync_at, last_full_sync_at, last_error, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (repo) DO UPDATE SET last_sync_at = excluded.last_sync_at,
           last_full_sync_at = excluded.last_full_sync_at, last_error = excluded.last_error,
           updated_at = excluded.updated_at`,
      )
      .run(repo, next.lastSyncAt, next.lastFullSyncAt, next.lastError, next.updatedAt);
  }
}
