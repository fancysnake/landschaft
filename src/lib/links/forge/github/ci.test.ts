import { describe, expect, it } from "vitest";

import type { GqlError } from "./client";

import { fakeGithub } from "../../../__fixtures__/github";
import {
  type CiBranchNode,
  type CiContext,
  type DefaultBranchNode,
  fetchCiBranchesPage,
  fetchCiJobs,
  toCiJobs,
} from "./ci";

const commits = (...logins: (string | null)[]) => ({
  nodes: logins.map((login) => ({ author: { user: login === null ? null : { login } } })),
});
const checkRun = (
  name: string,
  conclusion: string | null,
  workflow: string | null = "CI",
  startedAt = "2026-05-01T00:00:00Z",
) => ({
  type: "CheckRun" as const,
  name,
  conclusion,
  detailsUrl: `https://ci/${name}`,
  url: `https://github.com/runs/${name}`,
  startedAt,
  completedAt: startedAt,
  checkSuite: { workflowRun: workflow === null ? null : { workflow: { name: workflow } } },
});
const branch = (contexts: CiContext[], history = commits("ann")): CiBranchNode => ({
  associatedPullRequests: { nodes: [{ number: 4, url: "https://github.com/acme/app/pull/4" }] },
  mergedPullRequests: { nodes: [] },
  closedPullRequests: { nodes: [] },
  target: {
    oid: "abc",
    url: "https://github.com/acme/app/commit/abc",
    history,
    statusCheckRollup: { contexts: { nodes: contexts } },
  },
});
const base = (aheadBy: number, ahead = commits()): DefaultBranchNode => ({
  name: "main",
  compare: { aheadBy, commits: ahead },
});

/** A failing branch with no open PR, and a closed one whose head is `headRefOid`. */
const closed = (headRefOid: string): CiBranchNode => ({
  ...branch([checkRun("test", "FAILURE")]),
  associatedPullRequests: { nodes: [] },
  closedPullRequests: {
    nodes: [{ number: 7, url: "https://github.com/acme/app/pull/7", headRefOid }],
  },
});

describe("toCiJobs", () => {
  it("keeps the failed check runs and commit statuses, the newest run per job", () => {
    const jobs = toCiJobs(
      "acme/app",
      "feat/x",
      branch([
        checkRun("test", "FAILURE"),
        checkRun("e2e", "TIMED_OUT", null),
        checkRun("lint", "SUCCESS"),
        checkRun("deploy", "CANCELLED"),
        checkRun("pending", null),
        {
          type: "StatusContext",
          context: "ci/jenkins",
          state: "ERROR",
          targetUrl: "javascript:alert(1)",
          createdAt: "2026-05-02T00:00:00Z",
        },
        {
          type: "StatusContext",
          context: "e2e",
          state: "FAILURE",
          targetUrl: null,
          createdAt: "2026-05-02T00:00:00Z",
        },
      ]),
      null,
    );
    expect(jobs.map(({ workflow, name, url }) => [workflow, name, url])).toEqual([
      ["CI", "test", "https://ci/test"],
      [null, "e2e", "https://github.com/acme/app/commit/abc"],
      [null, "ci/jenkins", "https://github.com/acme/app/commit/abc"],
    ]);
    expect(jobs[0]).toMatchObject({
      repo: "acme/app",
      branch: "feat/x",
      failedAt: "2026-05-01T00:00:00Z",
      pr: { number: 4 },
    });
  });

  it("lets a newer run of a job in another suite decide, passed or failed", () => {
    const later = "2026-05-03T00:00:00Z";
    const jobs = toCiJobs(
      "acme/app",
      "x",
      branch([
        checkRun("test", "FAILURE"),
        checkRun("test", "SUCCESS", "CI", later),
        checkRun("lint", "SUCCESS"),
        checkRun("lint", "FAILURE", "CI", later),
      ]),
      null,
    );
    expect(jobs.map(({ name, failedAt }) => [name, failedAt])).toEqual([["lint", later]]);
  });

  it("adds the check suites the rollup lacks, the newest run per job still deciding", () => {
    const later = "2026-05-03T00:00:00Z";
    const head = branch([checkRun("test", "FAILURE")]);
    head.target.checkSuites = {
      nodes: [
        { checkRuns: { nodes: [checkRun("mutation", "FAILURE", "Mutation Tests")] } },
        { checkRuns: { nodes: [checkRun("test", "SUCCESS", "CI", later)] } },
      ],
    };
    const jobs = toCiJobs("acme/app", "main", head, null);
    expect(jobs.map(({ workflow, name }) => [workflow, name])).toEqual([
      ["Mutation Tests", "mutation"],
    ]);
  });

  it("tells apart jobs whose workflow and name join into the same path", () => {
    const jobs = toCiJobs(
      "acme/app",
      "x",
      branch([checkRun("c", "FAILURE", "a/b"), checkRun("b/c", "FAILURE", "a")]),
      null,
    );
    expect(jobs.map(({ workflow, name }) => [workflow, name])).toEqual([
      ["a/b", "c"],
      ["a", "b/c"],
    ]);
  });

  it("skips check runs that have not finished, timestamps and all", () => {
    const jobs = toCiJobs(
      "acme/app",
      "x",
      branch([
        checkRun("test", "FAILURE"),
        { ...checkRun("test", null, "CI", "2026-05-03T00:00:00Z"), completedAt: null },
        { ...checkRun("lint", "FAILURE"), completedAt: null },
        { ...checkRun("e2e", "FAILURE"), startedAt: null },
      ]),
      null,
    );
    expect(jobs.map(({ name, failedAt }) => [name, failedAt])).toEqual([
      ["test", "2026-05-01T00:00:00Z"],
    ]);
  });

  it("takes the authors of the commits ahead, else of the last three", () => {
    const head = branch([checkRun("test", "FAILURE")], commits("ann", "bob"));
    const ahead = base(1, commits("renovate[bot]", null));
    expect(toCiJobs("acme/app", "x", head, ahead)[0]?.authors).toEqual(["renovate"]);
    expect(toCiJobs("acme/app", "main", head, base(0))[0]?.authors).toEqual(["ann", "bob"]);
    expect(toCiJobs("acme/app", "x", head, null)[0]?.authors).toEqual(["ann", "bob"]);
  });

  it("drops a branch merged by its PR or held whole by the default branch", () => {
    const head = branch([checkRun("test", "FAILURE")]);
    const squashed = { ...head, mergedPullRequests: { nodes: [{ headRefOid: "abc" }] } };
    expect(toCiJobs("acme/app", "x", squashed, base(2))).toEqual([]);
    expect(toCiJobs("acme/app", "x", head, base(0))).toEqual([]);
    const pushedSince = { ...head, mergedPullRequests: { nodes: [{ headRefOid: "old" }] } };
    expect(toCiJobs("acme/app", "x", pushedSince, base(2))).toHaveLength(1);
    expect(toCiJobs("acme/app", "x", head, { name: "main", compare: null })).toHaveLength(1);
  });

  it("takes the closed PR the head commit ran for when no PR is open", () => {
    expect(toCiJobs("acme/app", "x", closed("abc"), null)[0]?.pr).toEqual({
      number: 7,
      url: "https://github.com/acme/app/pull/7",
    });
    expect(toCiJobs("acme/app", "x", closed("old"), null)[0]?.pr).toBeNull();
  });
});

/** A client whose one response carries `repository` and `errors`, recording the request. */
const respond = (repository: Record<string, unknown>, ...errors: GqlError[]) =>
  fakeGithub({ data: { rateLimit: { remaining: 4000 }, repository }, errors });

/** A listed branch whose head commit's rollup is `state`. */
const rolled = (name: string, state: string | null) => ({
  name,
  target: { statusCheckRollup: state === null ? null : { state } },
});

describe("fetchCiBranchesPage", () => {
  it("lists the red branches and the default one, which alone reads its check suites", async () => {
    const refs = {
      pageInfo: { hasNextPage: true, endCursor: "c2" },
      nodes: [
        rolled("main", "SUCCESS"),
        rolled("feat/x", "FAILURE"),
        rolled("feat/y", "SUCCESS"),
        rolled("feat/z", null),
      ],
    };
    const { gh, requests } = respond({ defaultBranchRef: { name: "main" }, refs });

    await expect(fetchCiBranchesPage(gh, "acme/app", "c1")).resolves.toEqual({
      branches: [
        { name: "main", suites: true },
        { name: "feat/x", suites: false },
      ],
      hasNextPage: true,
      endCursor: "c2",
      rateRemaining: 4000,
    });
    expect(requests[0]?.variables).toEqual({ owner: "acme", name: "app", after: "c1" });
  });
});

const red = branch([checkRun("lint", "FAILURE")]);
const gone = (path: string[], type = "NOT_FOUND"): GqlError => ({
  message: "x",
  type,
  path: ["repository", ...path],
});

describe("fetchCiJobs", () => {
  const branches = [
    { name: "feat/x", suites: false },
    { name: "feat/y", suites: false },
  ];

  it("asks for every branch in one query, check suites only where the branch wants them", async () => {
    const { gh, requests } = respond({ b0: red, c0: base(1), b1: red, c1: base(1) });
    await fetchCiJobs(gh, "acme/app", [
      { name: "main", suites: true },
      { name: "feat/x", suites: false },
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.variables).toMatchObject({ branch0: "main", branch1: "feat/x" });
    expect(requests[0]?.query.match(/checkSuites\(/g)).toHaveLength(1);
  });

  it("skips a branch gone since it was listed", async () => {
    const { gh } = respond({ b0: null, c0: base(1), b1: red, c1: base(1) }, gone(["b0"]));
    await expect(fetchCiJobs(gh, "acme/app", branches)).resolves.toEqual({
      jobs: [expect.objectContaining({ branch: "feat/y" })],
      failed: [],
      rateRemaining: 4000,
    });
  });

  it("reads a branch without a comparison once its ref is gone", async () => {
    const comparison = { name: "main", compare: null };
    const { gh } = respond(
      { b0: red, c0: comparison, b1: red, c1: base(1) },
      gone(["c0", "compare"]),
    );
    const page = await fetchCiJobs(gh, "acme/app", branches);
    expect(page.jobs.map((job) => job.branch)).toEqual(["feat/x", "feat/y"]);
    expect(page.failed).toEqual([]);
  });

  it("fails the branch any other error hits", async () => {
    const data = { b0: red, c0: base(1), b1: null, c1: { name: "main", compare: null } };
    for (const field of ["b1", "c1"]) {
      const page = await fetchCiJobs(
        respond(data, gone([field], "INTERNAL")).gh,
        "acme/app",
        branches,
      );
      expect(page.jobs.map((job) => job.branch)).toEqual(["feat/x"]);
      expect(page.failed).toEqual(["feat/y"]);
    }
  });

  it("fails the branch a NOT_FOUND hits below its refs", async () => {
    const data = { b0: red, c0: base(1), b1: red, c1: base(1) };
    for (const path of [
      ["b1", "target", "statusCheckRollup"],
      ["c1", "compare", "commits"],
    ]) {
      const page = await fetchCiJobs(respond(data, gone(path)).gh, "acme/app", branches);
      expect(page.jobs.map((job) => job.branch)).toEqual(["feat/x"]);
      expect(page.failed).toEqual(["feat/y"]);
    }
  });

  it("fails every branch on an error that hits none", async () => {
    const { gh } = respond({ b0: red, c0: base(1), b1: red, c1: base(1) }, { message: "x" });
    await expect(fetchCiJobs(gh, "acme/app", branches)).resolves.toMatchObject({
      jobs: [],
      failed: ["feat/x", "feat/y"],
    });
  });
});
