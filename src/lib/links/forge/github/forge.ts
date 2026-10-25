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

export class GithubForge implements Forge {
  constructor(private readonly gh: GithubClient) {}

  issuesPage(repo: string, options: PageOptions) {
    return fetchIssuesPage(this.gh, repo, options);
  }

  pullsPage(repo: string, options: PageOptions) {
    return fetchPullsPage(this.gh, repo, options);
  }

  pullStatuses(repo: string, numbers: number[]) {
    return fetchPullStatuses(this.gh, repo, numbers);
  }

  ciBranchesPage(repo: string, after: string | null) {
    return fetchCiBranchesPage(this.gh, repo, after);
  }

  ciJobs(repo: string, branches: CiBranch[]) {
    return fetchCiJobs(this.gh, repo, branches);
  }

  viewer() {
    return fetchViewer(this.gh);
  }

  repoLabels(repo: string) {
    return fetchRepoLabels(this.gh, repo);
  }
}
