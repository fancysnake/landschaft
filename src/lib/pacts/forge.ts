import type { CiJob, FetchedIssue, LabelDef, PullStatus } from "./issues";

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

export interface PullStatusPage {
  statuses: PullStatus[];
  hasNextPage: boolean;
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

export interface CiJobsPage {
  jobs: CiJob[];
  /** Branches an unexpected error hit, whose cached jobs still hold. */
  failed: string[];
  hasNextPage: boolean;
  rateRemaining: number;
}

/** The code host the sync reads issues, PRs, labels and CI jobs from. */
export interface Forge {
  issuesPage(repo: string, options: PageOptions): Promise<IssuesPage>;
  /** Same contract as `issuesPage`; with `since`, paging ends at the first older PR. */
  pullsPage(repo: string, options: PageOptions): Promise<IssuesPage>;
  /** Statuses of the PRs, in as many pages as the forge splits them into; none for no PRs. */
  pullStatuses(repo: string, numbers: number[]): AsyncIterable<PullStatusPage>;
  ciBranchesPage(repo: string, after: string | null): Promise<CiBranchesPage>;
  /** Failed jobs on the branches, paged like `pullStatuses`. */
  ciJobs(repo: string, branches: CiBranch[]): AsyncIterable<CiJobsPage>;
  /** Login of the account the token belongs to. */
  viewer(): Promise<string>;
  repoLabels(repo: string): Promise<Omit<LabelDef, "repo">[]>;
}
