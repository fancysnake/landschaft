import type { PullStatusLabel } from "./status";

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

/** An issue ref with the state it had when it was synced. */
export interface StatedRef extends IssueRef {
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
  parent: StatedRef | null;
  subIssues: Progress;
  blockedBy: StatedRef[];
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

/**
 * A check run or commit status that failed on an unmerged branch's head commit. `authors` are
 * those of the branch's commits ahead of the default branch, or of its last three on the default
 * branch or one without a merge base; a board shows the job when one of them is a global user.
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
  /**
   * The open PR from the branch, else the closed one its head commit ran for; `closedAt` is null
   * for the open one.
   */
  pr: { number: number; url: string; closedAt: string | null } | null;
}

/** What a board is built from: the cached items and failed CI jobs of the configured repos. */
export interface Snapshot {
  issues: Issue[];
  jobs: CiJob[];
}

export function ciJobKey(job: Pick<CiJob, "repo" | "branch" | "workflow" | "name">): string {
  // Fields apart, since a workflow or job name may hold any separator.
  return JSON.stringify([job.repo, job.branch, job.workflow, job.name]);
}
