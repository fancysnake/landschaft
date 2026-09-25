import type { SortBy, SortDir } from "./schema";

export type IssueState = "OPEN" | "CLOSED";

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

export interface Issue {
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
  repo: string;
  number: number;
  title: string;
  url: string;
  assignees: Assignee[];
  labels: LabelRef[];
  progress: Progress | null;
  blocked: boolean;
  isEpic: boolean;
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
  /** Login the token belongs to; drives the "mine" scope. */
  viewer: string | null;
}
