import type { SortBy, SortDir, StatusLabel } from "./schema";

export type IssueState = "OPEN" | "CLOSED";
export type IssueKind = "issue" | "pr";

export interface IssueRef {
  repo: string;
  number: number;
}

export interface LabelRef {
  name: string;
  color: string;
}

export interface LabelDef extends LabelRef {
  repo: string;
  description: string | null;
}

export interface Assignee {
  login: string;
  avatarUrl: string;
}

export interface Blocker {
  repo: string;
  number: number;
  state: IssueState;
}

export interface Progress {
  total: number;
  completed: number;
  percent: number;
}

/** An issue or a pull request; PRs have no parent, sub-issues or blockers. */
export interface Issue {
  kind: IssueKind;
  repo: string;
  number: number;
  nodeId: string;
  title: string;
  state: IssueState;
  url: string;
  issueType: string | null;
  /** Login of the issue author; null for deleted users. */
  author: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  labels: LabelRef[];
  assignees: Assignee[];
  parent: { repo: string; number: number } | null;
  subIssues: Progress;
  blockedBy: Blocker[];
  /** Total from GitHub; larger than blockedBy.length when the list was truncated. */
  blockedByTotal: number;
  /** Issues a PR closes when merged; empty for issues. */
  linked: IssueRef[];
  /** PR status labels that hold for a PR, set by the sync's status query; empty for issues. */
  statuses: StatusLabel[];
}

/** An issue or PR as GitHub's issue and PR queries return it, without the PR statuses. */
export type FetchedIssue = Omit<Issue, "statuses">;

export interface PullStatus {
  number: number;
  statuses: StatusLabel[];
}

export function issueKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}

export function parseIssueKey(key: string): { repo: string; number: number } | null {
  const match = /^([^#]+)#(\d+)$/.exec(key);
  if (!match) return null;
  return { repo: match[1]!, number: Number(match[2]) };
}

export interface Card {
  key: string;
  kind: IssueKind;
  repo: string;
  number: number;
  title: string;
  url: string;
  assignees: Assignee[];
  labels: LabelRef[];
  progress: Progress | null;
  blocked: boolean;
  isEpic: boolean;
  /** Empty for issues. */
  statuses: StatusLabel[];
  createdAt: string;
  updatedAt: string;
}

export interface Epic {
  key: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  progress: Progress | null;
}

export interface Board {
  cells: Record<string, Card[]>;
  laneTotals: Record<string, number>;
  hiddenBlocked: Record<string, number>;
  epics: Epic[];
  unplaced: number;
  assignees: string[];
  labels: string[];
  sort: { by: SortBy; dir: SortDir };
}

export function cellKey(laneId: string, colId: string): string {
  return `${laneId}:${colId}`;
}

export interface SyncState {
  repo: string;
  lastSyncAt: string | null;
  lastFullSyncAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
}

export interface SyncStatus {
  version: number;
  lastSyncAt: string | null;
  lastError: string | null;
  rateRemaining: number | null;
  inFlight: string[];
  /** Login the token belongs to; what `@me` in a dashboard's users stands for. */
  viewer: string | null;
}
