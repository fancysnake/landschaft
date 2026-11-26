import type {
  CiBranchesPage,
  CiJobsPage,
  Forge,
  IssuesByNumberPage,
  IssuesPage,
  PageOptions,
} from "../../../pacts/forge";
import type { GitlabClient } from "./client";

import { batched } from "../batched";
import { fetchLabels, fetchMergeRequestsPage, fetchStatuses, fetchViewer } from "./merge-requests";

/** Merge requests per status query, bounded by GitLab's GraphQL query complexity. */
const STATUS_BATCH = 50;

/** A self-managed GitLab: merge requests as PRs; no issues and no failed CI jobs. */
export class GitlabForge implements Forge {
  constructor(private readonly gitlab: GitlabClient) {}

  async issuesPage(): Promise<IssuesPage> {
    return { issues: [], hasNextPage: false, endCursor: null, rateRemaining: null };
  }

  pullsPage(repo: string, options: PageOptions) {
    return fetchMergeRequestsPage(this.gitlab, repo, options);
  }

  async *issuesByNumber(): AsyncGenerator<IssuesByNumberPage> {}

  pullStatuses(repo: string, numbers: number[]) {
    return batched(numbers, STATUS_BATCH, (batch) => fetchStatuses(this.gitlab, repo, batch));
  }

  async ciBranchesPage(): Promise<CiBranchesPage> {
    return { branches: [], hasNextPage: false, endCursor: null, rateRemaining: null };
  }

  async *ciJobs(): AsyncGenerator<CiJobsPage> {}

  viewer() {
    return fetchViewer(this.gitlab);
  }

  repoLabels(repo: string) {
    return fetchLabels(this.gitlab, repo);
  }
}
