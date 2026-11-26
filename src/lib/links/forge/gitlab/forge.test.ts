import { describe, expect, it } from "vitest";

import { fakeGitlab } from "../../../__fixtures__/gitlab";
import { GitlabForge } from "./forge";

describe("GitlabForge", () => {
  it("has no issues and no CI jobs, and asks GitLab for neither", async () => {
    const { gitlab, requests } = fakeGitlab();
    const forge = new GitlabForge(gitlab);

    await expect(forge.issuesPage()).resolves.toMatchObject({ issues: [], hasNextPage: false });
    await expect(forge.ciBranchesPage()).resolves.toMatchObject({ branches: [] });
    await expect(Array.fromAsync(forge.ciJobs())).resolves.toEqual([]);

    expect(requests).toEqual([]);
  });

  it("asks for merge request statuses 50 at a time", async () => {
    const empty = { data: { project: { mergeRequests: { nodes: [] } } } };
    const { gitlab, requests } = fakeGitlab(empty, empty);
    const numbers = Array.from({ length: 51 }, (_, i) => i + 1);

    const pages = await Array.fromAsync(new GitlabForge(gitlab).pullStatuses("group/app", numbers));

    expect(pages.map((page) => page.hasNextPage)).toEqual([true, false]);
    expect(requests.map(({ variables }) => (variables.iids as string[]).length)).toEqual([50, 1]);
  });
});
