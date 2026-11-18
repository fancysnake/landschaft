import type { CiBranch, Forge, PageOptions } from "../../../pacts/forge";
import type { GithubClient } from "./client";

import { fetchCiBranchesPage, fetchCiJobs } from "./ci";
import {
  fetchIssuesPage,
  fetchPullsPage,
  fetchPullStatuses,
  fetchRepoLabels,
  fetchViewer,
} from "./issues";

/** PRs per status query and branches per CI job query, bounded by GitHub's GraphQL query cost. */
const STATUS_BATCH = 50;
const CI_BATCH = 20;

/** Fetches `items` `size` at a time, one page per query. */
async function* batched<T, P>(items: T[], size: number, fetch: (batch: T[]) => Promise<P>) {
  for (let start = 0; start < items.length; start += size) {
    const page = await fetch(items.slice(start, start + size));
    yield { ...page, hasNextPage: start + size < items.length };
  }
}

export class GithubForge implements Forge {
  constructor(private readonly gh: GithubClient) {}

  issuesPage(repo: string, options: PageOptions) {
    return fetchIssuesPage(this.gh, repo, options);
  }

  pullsPage(repo: string, options: PageOptions) {
    return fetchPullsPage(this.gh, repo, options);
  }

  pullStatuses(repo: string, numbers: number[]) {
    return batched(numbers, STATUS_BATCH, (batch) => fetchPullStatuses(this.gh, repo, batch));
  }

  ciBranchesPage(repo: string, after: string | null) {
    return fetchCiBranchesPage(this.gh, repo, after);
  }

  ciJobs(repo: string, branches: CiBranch[]) {
    return batched(branches, CI_BATCH, (batch) => fetchCiJobs(this.gh, repo, batch));
  }

  viewer() {
    return fetchViewer(this.gh);
  }

  repoLabels(repo: string) {
    return fetchRepoLabels(this.gh, repo);
  }
}
