import { describe, expect, it } from "vitest";

import { fakeGithub } from "../../../__fixtures__/github";
import { GithubForge } from "./forge";

/** As many response bodies with an empty repository, each a successful query. */
const bodies = (count: number) =>
  Array.from({ length: count }, () => ({
    data: { rateLimit: { remaining: 4000 }, repository: {} },
  }));

/** The flag of every page the forge yields. */
const flags = async (pages: AsyncIterable<{ hasNextPage: boolean }>) => {
  const seen: boolean[] = [];
  for await (const page of pages) seen.push(page.hasNextPage);
  return seen;
};

describe("GithubForge", () => {
  it("asks for PR statuses 50 at a time, the last page alone without a next one", async () => {
    const { gh, requests } = fakeGithub(...bodies(2));
    const numbers = Array.from({ length: 51 }, (_, i) => i + 1);

    await expect(flags(new GithubForge(gh).pullStatuses("acme/app", numbers))).resolves.toEqual([
      true,
      false,
    ]);

    expect(requests.map(({ query }) => query.match(/pullRequest\(/g)?.length)).toEqual([50, 1]);
  });

  it("asks for CI jobs 20 branches at a time, the last page alone without a next one", async () => {
    const { gh, requests } = fakeGithub(...bodies(2));
    const branches = Array.from({ length: 21 }, (_, i) => ({ name: `b${i + 1}`, suites: false }));

    await expect(flags(new GithubForge(gh).ciJobs("acme/app", branches))).resolves.toEqual([
      true,
      false,
    ]);

    expect(requests.map(({ variables }) => variables["branch0"])).toEqual(["b1", "b21"]);
    expect(requests[0]?.variables).toHaveProperty("branch19", "b20");
    expect(requests[0]?.variables).not.toHaveProperty("branch20");
  });

  it("asks nothing for no PRs and no branches", async () => {
    const { gh, requests } = fakeGithub();
    const forge = new GithubForge(gh);

    await expect(flags(forge.pullStatuses("acme/app", []))).resolves.toEqual([]);
    await expect(flags(forge.issuesByNumber("acme/app", []))).resolves.toEqual([]);
    await expect(flags(forge.ciJobs("acme/app", []))).resolves.toEqual([]);

    expect(requests).toEqual([]);
  });
});
