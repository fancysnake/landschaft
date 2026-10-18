import type { SortBy, SortDir } from "./schema";
import type { PullStatusLabel, StatusLabel } from "./status";

export type IssueState = "OPEN" | "CLOSED";
export type IssueKind = "issue" | "pr";
/** What a board shows: issues, PRs and failed CI jobs. */
export type ItemKind = IssueKind | "ci-job";

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
  statuses: PullStatusLabel[];
}

/** An issue or PR as GitHub's issue and PR queries return it, without the PR statuses. */
export type FetchedIssue = Omit<Issue, "statuses">;

export interface PullStatus {
  number: number;
  statuses: PullStatusLabel[];
}

export function issueKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}

export function parseIssueKey(key: string): { repo: string; number: number } | null {
  const match = /^([^#]+)#(\d+)$/.exec(key);
  if (!match) return null;
  return { repo: match[1]!, number: Number(match[2]) };
}

/**
 * A check run or commit status that failed on a branch's head commit. `authors` are those of the
 * branch's commits ahead of the default branch, or of its last three when none are ahead; a board
 * shows the job when one of them is one of the global users.
 */
export interface CiJob {
  repo: string;
  branch: string;
  /** The Actions workflow of the job; null for other check runs and for commit statuses. */
  workflow: string | null;
  name: string;
  url: string;
  failedAt: string;
  authors: string[];
  /** The open PR from the branch. */
  pr: { number: number; url: string } | null;
}

export function ciJobKey(job: Pick<CiJob, "repo" | "branch" | "workflow" | "name">): string {
  // Fields apart, since a workflow or job name may hold any separator.
  return JSON.stringify([job.repo, job.branch, job.workflow, job.name]);
}

export type Card = IssueItemCard | CiJobCard;

export interface CiJobCard extends Omit<CiJob, "authors"> {
  key: string;
  kind: "ci-job";
}

export interface IssueItemCard {
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
  /** At most `is:has-pr` for issues. */
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
  /** Marked as in active development on this dashboard. */
  starred: boolean;
}

/** What the filter bar and repo chips need from any dashboard view. */
export interface Facets {
  /** Repos among the dashboard's items, whether shown or not; the view's repo chips. */
  repos: string[];
  assignees: string[];
  labels: string[];
  /** Names of the failed CI jobs among the dashboard's items. */
  jobs: string[];
  sort: { by: SortBy; dir: SortDir };
}

export interface Inbox extends Facets {
  /** Cards by group id; each item sits in the first group it matches. */
  groups: Record<string, Card[]>;
  /** Items shown in a group. */
  total: number;
}

export interface Board extends Facets {
  cells: Record<string, Card[]>;
  laneTotals: Record<string, number>;
  /** Issues shown in each column; one in several lanes counts once. */
  columnTotals: Record<string, number>;
  hiddenBlocked: Record<string, number>;
  epics: Epic[];
  /** Issues shown in at least one cell; one in several cells counts once. */
  total: number;
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
