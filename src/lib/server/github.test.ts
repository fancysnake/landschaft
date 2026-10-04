import { describe, expect, it, vi } from "vitest";

import type { StatusLabel } from "../schema";

import {
  type CheckContext,
  createGithubClient,
  fetchIssuesPage,
  fetchPullStatuses,
  GithubError,
  type IssueNode,
  type PullStatusNode,
  removeLabel,
  toIssue,
  toPull,
  toPullStatus,
} from "./github";

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
  parent: { number: 3, repository: { nameWithOwner: "acme/app" } },
  subIssuesSummary: { total: 2, completed: 1, percentCompleted: 50 },
  issueDependenciesSummary: { totalBlockedBy: 1 },
  blockedBy: { nodes: [{ number: 8, state: "CLOSED", repository: { nameWithOwner: "acme/lib" } }] },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

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
      parent: { repo: "acme/app", number: 3 },
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
    mergeable: "MERGEABLE",
    author: { login: "bob" },
    commits: { nodes: [] },
    reviewThreads: { nodes: [] },
    ...overrides,
  };
}

const rollup = (nodes: CheckContext[]) => ({
  nodes: [{ commit: { statusCheckRollup: { contexts: { nodes } } } }],
});

const run = (
  status: string,
  conclusion: string | null,
  isRequired: boolean,
  name = "build",
): CheckContext => ({ type: "CheckRun", name, status, conclusion, isRequired });

const commitStatus = (state: string, isRequired: boolean, name = "ci/build"): CheckContext => ({
  type: "StatusContext",
  name,
  state,
  isRequired,
});

const thread = (isResolved: boolean, last: string | null) => ({
  isResolved,
  comments: { nodes: [{ author: last === null ? null : { login: last } }] },
});

const holds = (status: StatusLabel, overrides: Partial<PullStatusNode>) =>
  toPullStatus(statusNode(overrides)).statuses.includes(status);

const ci = (checks: CheckContext[]) =>
  toPullStatus(statusNode({ commits: rollup(checks) })).statuses;

/** Beside a passing required check, so optional checks are not all there is. */
const ciProtected = (check: CheckContext) => ci([run("COMPLETED", "SUCCESS", true, "gate"), check]);

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

  it("flags merge conflicts only when GitHub says CONFLICTING", () => {
    expect(holds("is:conflicting", { mergeable: "CONFLICTING" })).toBe(true);
    expect(holds("is:conflicting", { mergeable: "UNKNOWN" })).toBe(false);
  });

  it.each<[string, CheckContext, StatusLabel[]]>([
    ["passed run", run("COMPLETED", "SUCCESS", true), []],
    ["skipped run", run("COMPLETED", "SKIPPED", true), []],
    ["failed run", run("COMPLETED", "FAILURE", true), ["is:ci:failed"]],
    ["cancelled run", run("COMPLETED", "CANCELLED", true), ["is:ci:failed"]],
    ["running run", run("IN_PROGRESS", null, true), ["is:ci:running"]],
    ["queued run", run("QUEUED", null, true), ["is:ci:running"]],
    ["optional failed run", run("COMPLETED", "FAILURE", false), []],
    ["optional running run", run("IN_PROGRESS", null, false), []],
    ["pending status", commitStatus("PENDING", true), ["is:ci:running"]],
    ["expected status", commitStatus("EXPECTED", true), ["is:ci:running"]],
    ["errored status", commitStatus("ERROR", true), ["is:ci:failed"]],
    ["successful status", commitStatus("SUCCESS", true), []],
    ["optional errored status", commitStatus("ERROR", false), []],
    [
      "optional failed codecov status",
      commitStatus("FAILURE", false, "codecov/patch"),
      ["is:ci:failed"],
    ],
    [
      "optional pending codecov status",
      commitStatus("PENDING", false, "codecov/project"),
      ["is:ci:running"],
    ],
    [
      "optional failed codecov run",
      run("COMPLETED", "FAILURE", false, "codecov/patch"),
      ["is:ci:failed"],
    ],
  ])("CI with a %s: %j", (_, check, expected) => {
    expect(ciProtected(check)).toEqual(expected);
  });

  it("counts every check when none is required", () => {
    expect(ci([run("COMPLETED", "FAILURE", false)])).toEqual(["is:ci:failed"]);
    expect(ci([commitStatus("PENDING", false)])).toEqual(["is:ci:running"]);
    expect(ci([run("COMPLETED", "SUCCESS", false)])).toEqual([]);
  });

  it("flags CI failed and running at once", () => {
    expect(ci([run("COMPLETED", "FAILURE", true), commitStatus("PENDING", true)])).toEqual([
      "is:ci:failed",
      "is:ci:running",
    ]);
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
    const queries: string[] = [];
    const fetchImpl = vi.fn(async (_: string, init: RequestInit) => {
      const { query } = JSON.parse(init.body as string) as { query: string };
      queries.push(query);
      const repository = {
        pr7: statusNode({ number: 7, mergeable: "CONFLICTING" }),
        pr8: null,
      };
      return jsonResponse({ data: { rateLimit: { remaining: 4321 }, repository } });
    });
    const gh = createGithubClient(async () => "tok", fetchImpl);

    const page = await fetchPullStatuses(gh, "acme/app", [7, 8]);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("isRequired(pullRequestNumber: 8)");
    expect(page).toEqual({
      statuses: [{ number: 7, statuses: ["is:conflicting"] }],
      rateRemaining: 4321,
    });
  });
});

describe("createGithubClient", () => {
  it("sends the token and surfaces GraphQL errors", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ errors: [{ message: "bad" }, { message: "worse" }] }),
    );
    const gh = createGithubClient(async () => "tok", fetchImpl);
    await expect(gh.gql("query {}", {})).rejects.toThrow("bad; worse");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/graphql");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("resolves the token once", async () => {
    const tokenSource = vi.fn(async () => "tok");
    const gh = createGithubClient(tokenSource, async () => jsonResponse({ data: { ok: true } }));
    await gh.gql("q", {});
    await gh.gql("q", {});
    expect(tokenSource).toHaveBeenCalledTimes(1);
  });

  it("maps a page of issues and passes pagination variables", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: {
          rateLimit: { remaining: 4900 },
          repository: {
            issues: { pageInfo: { hasNextPage: true, endCursor: "c2" }, nodes: [node] },
          },
        },
      }),
    );
    const gh = createGithubClient(async () => "tok", fetchImpl);
    const page = await fetchIssuesPage(gh, "acme/app", {
      since: "2026-01-01T00:00:00Z",
      openOnly: false,
      after: "c1",
    });
    expect(page).toMatchObject({ hasNextPage: true, endCursor: "c2", rateRemaining: 4900 });
    expect(page.issues[0]?.number).toBe(12);
    const body = JSON.parse(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    ) as {
      variables: Record<string, unknown>;
    };
    expect(body.variables).toEqual({
      owner: "acme",
      name: "app",
      since: "2026-01-01T00:00:00Z",
      states: null,
      after: "c1",
    });
  });

  it("fails clearly when the repository is not accessible", async () => {
    const gh = createGithubClient(
      async () => "tok",
      async () => jsonResponse({ data: { rateLimit: { remaining: 1 }, repository: null } }),
    );
    await expect(
      fetchIssuesPage(gh, "acme/gone", { since: null, openOnly: false, after: null }),
    ).rejects.toThrow(/not found/);
  });
});

describe("removeLabel", () => {
  it("ignores a 404 and rethrows anything else", async () => {
    const gh404 = createGithubClient(
      async () => "tok",
      async () => new Response("nope", { status: 404 }),
    );
    await expect(removeLabel(gh404, "acme/app", 1, "a b")).resolves.toBeUndefined();

    const fetchImpl = vi.fn(async () => new Response("denied", { status: 403 }));
    const gh403 = createGithubClient(async () => "tok", fetchImpl);
    await expect(removeLabel(gh403, "acme/app", 1, "a b")).rejects.toBeInstanceOf(GithubError);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://api.github.com/repos/acme/app/issues/1/labels/a%20b",
    );
  });
});
