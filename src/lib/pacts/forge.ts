import type { CiJob, FetchedIssue, LabelDef, PullStatus } from "./types";

export interface IssuesPage {
  issues: FetchedIssue[];
  hasNextPage: boolean;
  endCursor: string | null;
  rateRemaining: number;
}

/** Which states a page fetches; a closed PR is closed or merged. */
export type PageStates = "open" | "closed" | "all";

export interface PageOptions {
  since: string | null;
  states: PageStates;
  after: string | null;
}

/** PRs per status query; the caller splits the open PRs into batches this size. */
export const STATUS_BATCH = 50;

export interface PullStatusPage {
  statuses: PullStatus[];
  rateRemaining: number;
}

/** A branch to read failed jobs of; `suites` also reads its head commit's check suites. */
export interface CiBranch {
  name: string;
  suites: boolean;
}

export interface CiBranchesPage {
  branches: CiBranch[];
  hasNextPage: boolean;
  endCursor: string | null;
  rateRemaining: number;
}

/** Branches per CI job query. */
export const CI_BATCH = 20;

export interface CiJobsPage {
  jobs: CiJob[];
  /** Branches an unexpected error hit, whose cached jobs still hold. */
  failed: string[];
  rateRemaining: number;
}

/** The code host the sync reads issues, PRs, labels and CI jobs from. */
export interface Forge {
  issuesPage(repo: string, options: PageOptions): Promise<IssuesPage>;
  /** Same contract as `issuesPage`; with `since`, paging ends at the first older PR. */
  pullsPage(repo: string, options: PageOptions): Promise<IssuesPage>;
  /** Statuses of up to `STATUS_BATCH` PRs. */
  pullStatuses(repo: string, numbers: number[]): Promise<PullStatusPage>;
  ciBranchesPage(repo: string, after: string | null): Promise<CiBranchesPage>;
  /** Failed jobs on up to `CI_BATCH` branches. */
  ciJobs(repo: string, branches: CiBranch[]): Promise<CiJobsPage>;
  /** Login of the account the token belongs to. */
  viewer(): Promise<string>;
  repoLabels(repo: string): Promise<Omit<LabelDef, "repo">[]>;
}
