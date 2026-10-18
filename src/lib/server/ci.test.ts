import { describe, expect, it } from "vitest";

import { type CiBranchNode, type CiContext, type DefaultBranchNode, toCiJobs } from "./ci";

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
});
