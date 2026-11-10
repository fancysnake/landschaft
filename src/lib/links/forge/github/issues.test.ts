import { describe, expect, it } from "vitest";

import type { PullStatusLabel } from "../../../pacts/status";
import type { StatusState } from "./client";

import { fakeGithub } from "../../../__fixtures__/github";
import {
  type CheckContext,
  fetchIssuesPage,
  fetchPullsPage,
  fetchPullStatuses,
  fetchRepoLabels,
  fetchViewer,
  type IssueNode,
  type PullNode,
  type PullStatusNode,
  toIssue,
  toPull,
  toPullStatus,
} from "./issues";

const node: IssueNode = {
  id: "I_1",
  number: 12,
  title: "Broken login",
  state: "OPEN",
  url: "https://github.com/acme/app/issues/12",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
  closedAt: null,
  issueType: { name: "Bug" },
  author: { login: "bob" },
  labels: { nodes: [{ name: "bug", color: "d73a4a" }] },
  assignees: { nodes: [{ login: "ann", avatarUrl: "https://avatars/ann" }] },
  parent: { number: 3, state: "OPEN", repository: { nameWithOwner: "acme/app" } },
  subIssuesSummary: { total: 2, completed: 1, percentCompleted: 50 },
  issueDependenciesSummary: { totalBlockedBy: 1 },
  blockedBy: { nodes: [{ number: 8, state: "CLOSED", repository: { nameWithOwner: "acme/lib" } }] },
};

describe("toIssue", () => {
  it("maps a GraphQL node to the cache shape", () => {
    expect(toIssue("acme/app", node)).toEqual({
      kind: "issue",
      repo: "acme/app",
      number: 12,
      nodeId: "I_1",
      title: "Broken login",
      state: "OPEN",
      url: "https://github.com/acme/app/issues/12",
      issueType: "Bug",
      author: "bob",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      closedAt: null,
      labels: [{ name: "bug", color: "d73a4a" }],
      assignees: [{ login: "ann", avatarUrl: "https://avatars/ann" }],
      parent: { repo: "acme/app", number: 3, state: "OPEN" },
      subIssues: { total: 2, completed: 1, percent: 50 },
      blockedBy: [{ repo: "acme/lib", number: 8, state: "CLOSED" }],
      blockedByTotal: 1,
      linked: [],
    });
  });

  it("handles missing optional fields", () => {
    const issue = toIssue("acme/app", { ...node, issueType: null, author: null, parent: null });
    expect(issue.issueType).toBeNull();
    expect(issue.author).toBeNull();
    expect(issue.parent).toBeNull();
  });
});

describe("toPull", () => {
  it("maps a merged PR to a closed card with its closing issues", () => {
    const pull = toPull("acme/app", {
      id: "PR_1",
      number: 30,
      title: "Fix login",
      state: "MERGED",
      url: "https://github.com/acme/app/pull/30",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      closedAt: "2026-01-02T00:00:00Z",
      author: { login: "bob" },
      labels: { nodes: [] },
      assignees: { nodes: [] },
      closingIssuesReferences: {
        nodes: [{ number: 12, repository: { nameWithOwner: "acme/app" } }],
      },
    });
    expect(pull).toMatchObject({
      kind: "pr",
      state: "CLOSED",
      author: "bob",
      parent: null,
      linked: [{ repo: "acme/app", number: 12 }],
    });
  });
});

function statusNode(overrides: Partial<PullStatusNode> = {}): PullStatusNode {
  return {
    number: 30,
    isDraft: false,
    mergeable: "MERGEABLE",
    author: { login: "bob" },
    commits: { nodes: [] },
    reviewThreads: { nodes: [] },
    ...overrides,
  };
}

const rollup = (state: StatusState, nodes: CheckContext[] = []) => ({
  nodes: [{ commit: { statusCheckRollup: { state, contexts: { nodes } } } }],
});

const run = (status: string): CheckContext => ({ type: "CheckRun", status });

const commitStatus = (state: string): CheckContext => ({ type: "StatusContext", state });

const thread = (isResolved: boolean, last: string | null) => ({
  isResolved,
  comments: { nodes: [{ author: last === null ? null : { login: last } }] },
});

const holds = (status: PullStatusLabel, overrides: Partial<PullStatusNode>) =>
  toPullStatus(statusNode(overrides)).statuses.includes(status);

const ci = (state: StatusState, checks: CheckContext[] = []) =>
  toPullStatus(statusNode({ commits: rollup(state, checks) })).statuses;

describe("toPullStatus", () => {
  it("is clean without checks, threads or conflicts", () => {
    expect(toPullStatus(statusNode())).toEqual({ number: 30, statuses: [] });
  });

  it("lists every status that holds", () => {
    const pull = statusNode({
      mergeable: "CONFLICTING",
      reviewThreads: { nodes: [thread(false, "carol")] },
    });
    expect(toPullStatus(pull).statuses).toEqual(["is:conflicting", "is:unanswered"]);
  });

  it("flags drafts", () => {
    expect(holds("is:draft", { isDraft: true })).toBe(true);
  });

  it("flags merge conflicts only when GitHub says CONFLICTING", () => {
    expect(holds("is:conflicting", { mergeable: "CONFLICTING" })).toBe(true);
    expect(holds("is:conflicting", { mergeable: "UNKNOWN" })).toBe(false);
  });

  it.each<StatusState>(["FAILURE", "ERROR"])("flags CI failed when the commit is %s", (state) => {
    expect(ci(state)).toEqual(["is:ci:failed"]);
  });

  it("is clean when the last commit has no checks", () => {
    const pull = statusNode({ commits: { nodes: [{ commit: { statusCheckRollup: null } }] } });
    expect(toPullStatus(pull).statuses).toEqual([]);
  });

  it.each<[string, CheckContext]>([
    ["queued run", run("QUEUED")],
    ["running run", run("IN_PROGRESS")],
    ["pending status", commitStatus("PENDING")],
    ["expected status", commitStatus("EXPECTED")],
  ])("flags CI running with a %s", (_, check) => {
    expect(ci("PENDING", [check])).toEqual(["is:ci:running"]);
  });

  it("is clean once every check finished green", () => {
    expect(ci("SUCCESS", [run("COMPLETED"), commitStatus("SUCCESS")])).toEqual([]);
  });

  it("flags CI failed and running at once", () => {
    expect(ci("FAILURE", [run("IN_PROGRESS")])).toEqual(["is:ci:failed", "is:ci:running"]);
  });

  it("counts unresolved threads the PR author has not answered last", () => {
    const unanswered = (nodes: ReturnType<typeof thread>[]) =>
      holds("is:unanswered", { reviewThreads: { nodes } });
    expect(unanswered([thread(false, "carol")])).toBe(true);
    expect(unanswered([thread(false, null)])).toBe(true);
    expect(unanswered([thread(false, "bob")])).toBe(false);
    expect(unanswered([thread(true, "carol")])).toBe(false);
  });
});

describe("fetchPullStatuses", () => {
  it("asks for every PR in one query, each aliased with its own number", async () => {
    const repository = { pr7: statusNode({ number: 7, mergeable: "CONFLICTING" }), pr8: null };
    const { gh, requests } = fakeGithub({ data: { rateLimit: { remaining: 4321 }, repository } });

    const page = await fetchPullStatuses(gh, "acme/app", [7, 8]);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.query).toContain("pr8: pullRequest(number: 8)");
    expect(page).toEqual({
      statuses: [{ number: 7, statuses: ["is:conflicting"] }],
      rateRemaining: 4321,
    });
  });
});

describe("fetchIssuesPage", () => {
  it("maps a page of issues and passes pagination variables", async () => {
    const { gh, requests } = fakeGithub(connection("issues", [node], true));
    const page = await fetchIssuesPage(gh, "acme/app", {
      since: "2026-01-01T00:00:00Z",
      states: "all",
      after: "c1",
    });
    expect(page).toMatchObject({ hasNextPage: true, endCursor: "c2", rateRemaining: 4900 });
    expect(page.issues[0]?.number).toBe(12);
    expect(requests[0]?.variables).toEqual({
      owner: "acme",
      name: "app",
      since: "2026-01-01T00:00:00Z",
      states: null,
      after: "c1",
    });
  });

  it("asks for GitHub's maximum of 50 blockers", async () => {
    const { gh, requests } = fakeGithub(connection("issues", []));
    await fetchIssuesPage(gh, "acme/app", { since: null, states: "all", after: null });
    expect(requests[0]?.query).toContain("blockedBy(first: 50)");
  });

  it("fails clearly when the repository is not accessible", async () => {
    const { gh } = fakeGithub({ data: { rateLimit: { remaining: 1 }, repository: null } });
    await expect(
      fetchIssuesPage(gh, "acme/gone", { since: null, states: "all", after: null }),
    ).rejects.toThrow(/not found/);
  });

  it.each([
    ["open", ["OPEN"]],
    ["closed", ["CLOSED"]],
    ["all", null],
  ] as const)("asks for %s issues as %j", async (states, expected) => {
    const { gh, requests } = fakeGithub(connection("issues", []));
    await fetchIssuesPage(gh, "acme/app", { since: null, states, after: null });
    expect(requests[0]?.variables).toMatchObject({ states: expected });
  });
});

const connection = (key: "issues" | "pullRequests", nodes: unknown[], hasNextPage = false) => ({
  data: {
    rateLimit: { remaining: 4900 },
    repository: {
      [key]: { pageInfo: { hasNextPage, endCursor: hasNextPage ? "c2" : null }, nodes },
    },
  },
});

const pullNode = (number: number, updatedAt: string): PullNode => ({
  id: `PR_${number}`,
  number,
  title: `PR ${number}`,
  state: "OPEN",
  url: `https://github.com/acme/app/pull/${number}`,
  createdAt: updatedAt,
  updatedAt,
  closedAt: null,
  author: null,
  labels: { nodes: [] },
  assignees: { nodes: [] },
  closingIssuesReferences: { nodes: [] },
});

describe("fetchPullsPage", () => {
  it.each([
    ["open", ["OPEN"]],
    ["closed", ["CLOSED", "MERGED"]],
    ["all", null],
  ] as const)("asks for %s pull requests as %j", async (states, expected) => {
    const { gh, requests } = fakeGithub(connection("pullRequests", []));
    await fetchPullsPage(gh, "acme/app", { since: null, states, after: "c1" });
    expect(requests[0]?.variables).toEqual({
      owner: "acme",
      name: "app",
      states: expected,
      after: "c1",
    });
  });

  it("keeps the PRs updated since the cutoff and stops paging at the first older one", async () => {
    const nodes = [pullNode(20, "2026-05-01T11:30:00Z"), pullNode(21, "2026-04-01T00:00:00Z")];
    const { gh } = fakeGithub(connection("pullRequests", nodes, true));
    const page = await fetchPullsPage(gh, "acme/app", {
      since: "2026-05-01T10:58:00Z",
      states: "all",
      after: null,
    });
    expect(page.issues.map((issue) => issue.number)).toEqual([20]);
    expect(page).toMatchObject({ hasNextPage: false, rateRemaining: 4900 });
  });

  it("pages on without a cutoff", async () => {
    const { gh } = fakeGithub(
      connection("pullRequests", [pullNode(20, "2026-03-01T00:00:00Z")], true),
    );
    const page = await fetchPullsPage(gh, "acme/app", { since: null, states: "all", after: null });
    expect(page).toMatchObject({ hasNextPage: true, endCursor: "c2" });
    expect(page.issues).toHaveLength(1);
  });
});

describe("fetchViewer", () => {
  it("returns the token's login", async () => {
    await expect(fetchViewer(fakeGithub({ data: { viewer: { login: "me" } } }).gh)).resolves.toBe(
      "me",
    );
  });
});

/** A labels page holding `name`, followed by the page at `endCursor` when there is one. */
const labels = (name: string, endCursor: string | null) => ({
  data: {
    repository: {
      labels: {
        pageInfo: { hasNextPage: endCursor !== null, endCursor },
        nodes: [{ name, color: "ff0000", description: null }],
      },
    },
  },
});

describe("fetchRepoLabels", () => {
  it("collects the labels of every page", async () => {
    const { gh, requests } = fakeGithub(labels("bug", "c1"), labels("chore", null));
    const result = await fetchRepoLabels(gh, "acme/app");
    expect(result.map((label) => label.name)).toEqual(["bug", "chore"]);
    expect(requests.map(({ variables }) => variables)).toEqual([
      { owner: "acme", name: "app", after: null },
      { owner: "acme", name: "app", after: "c1" },
    ]);
  });
});
