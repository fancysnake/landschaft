import { describe, expect, it, vi } from "vitest";

import {
  createGithubClient,
  fetchIssuesPage,
  GithubError,
  type IssueNode,
  removeLabel,
  toIssue,
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
    });
  });

  it("handles missing optional fields", () => {
    const issue = toIssue("acme/app", { ...node, issueType: null, author: null, parent: null });
    expect(issue.issueType).toBeNull();
    expect(issue.author).toBeNull();
    expect(issue.parent).toBeNull();
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
      states: null,
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
      fetchIssuesPage(gh, "acme/gone", { since: null, states: null, after: null }),
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
