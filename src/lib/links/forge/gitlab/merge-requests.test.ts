import { describe, expect, it } from "vitest";

import type { PullStatusLabel } from "../../../pacts/status";

import { fakeGitlab, GITLAB_URL } from "../../../__fixtures__/gitlab";
import { createGitlabClient, getAccess } from "./client";
import {
  fetchLabels,
  fetchMergeRequestsPage,
  fetchStatuses,
  fetchViewer,
  type MergeRequestNode,
  type ReviewState,
  type StatusNode,
  toPull,
  toPullStatus,
} from "./merge-requests";

const REPO = "group/sub/project";

const node = (overrides: Partial<MergeRequestNode> = {}): MergeRequestNode => ({
  id: "gid://gitlab/MergeRequest/7",
  iid: "12",
  title: "Add authentication",
  state: "opened",
  webUrl: `${GITLAB_URL}${REPO}/-/merge_requests/12`,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-03T00:00:00Z",
  mergedAt: null,
  closedAt: null,
  author: { username: "ann" },
  labels: { nodes: [{ title: "backend", color: "#5CB85C" }] },
  assignees: { nodes: [{ username: "bob", avatarUrl: "/uploads/-/system/user/avatar/2/b.png" }] },
  reviewers: { nodes: [{ username: "cy.lee" }] },
  ...overrides,
});

const page = (nodes: MergeRequestNode[], hasNextPage = false) => ({
  data: {
    project: {
      mergeRequests: { pageInfo: { hasNextPage, endCursor: hasNextPage ? "c2" : null }, nodes },
    },
  },
});

describe("toPull", () => {
  it("maps an open merge request to a PR with its reviewers", () => {
    expect(toPull(fakeGitlab().gitlab, REPO, node())).toEqual({
      kind: "pr",
      repo: REPO,
      number: 12,
      nodeId: "gid://gitlab/MergeRequest/7",
      title: "Add authentication",
      state: "OPEN",
      url: "https://git.example.com/group/sub/project/-/merge_requests/12",
      issueType: null,
      author: "ann",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-03T00:00:00Z",
      closedAt: null,
      labels: [{ name: "backend", color: "5CB85C" }],
      assignees: [
        { login: "bob", avatarUrl: "https://git.example.com/uploads/-/system/user/avatar/2/b.png" },
      ],
      parent: null,
      subIssues: { total: 0, completed: 0, percent: 0 },
      blockedBy: [],
      blockedByTotal: 0,
      linked: [],
      reviewers: ["cy.lee"],
    });
  });

  it("closes a merged merge request at its merge, and keeps one mid-merge open", () => {
    const { gitlab } = fakeGitlab();
    const merged = node({ state: "merged", mergedAt: "2026-01-04T00:00:00Z" });
    expect(toPull(gitlab, REPO, merged)).toMatchObject({
      state: "CLOSED",
      closedAt: "2026-01-04T00:00:00Z",
    });
    const closed = node({ state: "closed", closedAt: "2026-01-05T00:00:00Z" });
    expect(toPull(gitlab, REPO, closed).closedAt).toBe("2026-01-05T00:00:00Z");
    expect(toPull(gitlab, REPO, node({ state: "locked" }))).toMatchObject({
      state: "OPEN",
      closedAt: null,
    });
  });
});

describe("fetchMergeRequestsPage", () => {
  it("asks for the open ones updated since, and reports the rate limit left", async () => {
    const { gitlab, requests } = fakeGitlab(page([node()], true));
    const result = await fetchMergeRequestsPage(gitlab, REPO, {
      since: "2026-01-02T00:00:00Z",
      states: "open",
      after: "c1",
    });
    expect(requests[0]).toMatchObject({
      url: "https://git.example.com/api/graphql",
      variables: { path: REPO, state: "opened", updatedAfter: "2026-01-02T00:00:00Z", after: "c1" },
    });
    expect(result).toMatchObject({ hasNextPage: true, endCursor: "c2", rateRemaining: 480 });
    expect(result.issues.map((issue) => issue.number)).toEqual([12]);
  });

  it("drops the open ones from a closed page", async () => {
    const nodes = [
      node(),
      node({ iid: "13", state: "merged" }),
      node({ iid: "14", state: "closed" }),
    ];
    const { gitlab, requests } = fakeGitlab(page(nodes));
    const result = await fetchMergeRequestsPage(gitlab, REPO, {
      since: null,
      states: "closed",
      after: null,
    });
    expect(requests[0]?.variables).toMatchObject({ state: "all" });
    expect(result.issues.map((issue) => issue.number)).toEqual([13, 14]);
  });

  it("names a project the token cannot read", async () => {
    const { gitlab } = fakeGitlab({ data: { project: null } });
    await expect(
      fetchMergeRequestsPage(gitlab, REPO, { since: null, states: "all", after: null }),
    ).rejects.toThrow("project group/sub/project not found or not accessible");
  });
});

const statusNode = (overrides: Partial<StatusNode> = {}): StatusNode => ({
  iid: "12",
  draft: false,
  conflicts: false,
  approved: false,
  author: { username: "ann" },
  headPipeline: null,
  reviewers: { nodes: [] },
  discussions: { nodes: [] },
  ...overrides,
});

const statuses = (overrides: Partial<StatusNode>): PullStatusLabel[] =>
  toPullStatus(statusNode(overrides)).statuses;

const reviewer = (reviewState: ReviewState | null) => ({
  mergeRequestInteraction: { reviewState },
});

const thread = (resolvable: boolean, resolved: boolean, last: string) => ({
  resolvable,
  resolved,
  notes: { nodes: [{ author: { username: last } }] },
});

describe("toPullStatus", () => {
  it("is clean without a pipeline, reviews or threads", () => {
    expect(toPullStatus(statusNode())).toEqual({ number: 12, statuses: [] });
  });

  it("reads draft, conflicts and the head pipeline", () => {
    expect(statuses({ draft: true, conflicts: true })).toEqual(["is:conflicting", "is:draft"]);
    expect(statuses({ headPipeline: { status: "FAILED" } })).toEqual(["is:ci:failed"]);
    expect(statuses({ headPipeline: { status: "PENDING" } })).toEqual(["is:ci:running"]);
    expect(statuses({ headPipeline: { status: "MANUAL" } })).toEqual([]);
    expect(statuses({ headPipeline: { status: "SUCCESS" } })).toEqual([]);
  });

  it("reads approval, which a request for changes outweighs", () => {
    expect(statuses({ approved: true, reviewers: { nodes: [reviewer("APPROVED")] } })).toEqual([
      "is:approved",
    ]);
    expect(
      statuses({
        approved: true,
        reviewers: { nodes: [reviewer("APPROVED"), reviewer("REQUESTED_CHANGES")] },
      }),
    ).toEqual(["is:changes-requested"]);
    expect(statuses({ reviewers: { nodes: [reviewer("UNREVIEWED"), reviewer(null)] } })).toEqual(
      [],
    );
  });

  it("is unanswered for an unresolved thread someone else spoke last in", () => {
    const unanswered = (...threads: ReturnType<typeof thread>[]) =>
      statuses({ discussions: { nodes: threads } }).includes("is:unanswered");
    expect(unanswered(thread(true, false, "bob"))).toBe(true);
    expect(unanswered(thread(true, false, "ann"))).toBe(false);
    expect(unanswered(thread(true, true, "bob"))).toBe(false);
    expect(unanswered(thread(false, false, "bob"))).toBe(false);
  });
});

describe("fetchStatuses", () => {
  it("asks for the merge requests by iid", async () => {
    const { gitlab, requests } = fakeGitlab({
      data: { project: { mergeRequests: { nodes: [statusNode({ draft: true })] } } },
    });
    await expect(fetchStatuses(gitlab, REPO, [12, 13])).resolves.toEqual({
      statuses: [{ number: 12, statuses: ["is:draft"] }],
      rateRemaining: 480,
    });
    expect(requests[0]?.variables).toEqual({ path: REPO, iids: ["12", "13"] });
  });
});

describe("fetchViewer", () => {
  it("gives the token's username, and fails for a token without a user", async () => {
    const { gitlab } = fakeGitlab(
      { data: { currentUser: { username: "ann" } } },
      { data: { currentUser: null } },
    );
    await expect(fetchViewer(gitlab)).resolves.toBe("ann");
    await expect(fetchViewer(gitlab)).rejects.toThrow("GITLAB_TOKEN belongs to no user");
  });
});

const labelNode = (title: string, kind = "ProjectLabel", color = "#ff0000") => ({
  id: `gid://gitlab/${kind}/1`,
  title,
  color,
  description: null,
});

const labels = (title: string, endCursor: string | null, nodes = [labelNode(title)]) => ({
  data: {
    project: {
      labels: {
        pageInfo: { hasNextPage: endCursor !== null, endCursor },
        nodes,
      },
    },
  },
});

describe("fetchLabels", () => {
  it("pages through the labels, colours without the #", async () => {
    const { gitlab, requests } = fakeGitlab(labels("bug", "c2"), labels("docs", null));
    await expect(fetchLabels(gitlab, REPO)).resolves.toEqual([
      { name: "bug", color: "ff0000", description: null },
      { name: "docs", color: "ff0000", description: null },
    ]);
    expect(requests.map(({ variables }) => variables.after)).toEqual([null, "c2"]);
  });

  it("keeps one label per name, the project's over a group's", async () => {
    const { gitlab } = fakeGitlab(
      labels("bug", "c2", [labelNode("bug", "GroupLabel", "#00ff00")]),
      labels("bug", null, [labelNode("bug"), labelNode("docs", "GroupLabel")]),
    );
    await expect(fetchLabels(gitlab, REPO)).resolves.toEqual([
      { name: "bug", color: "ff0000", description: null },
      { name: "docs", color: "ff0000", description: null },
    ]);
  });
});

describe("GitLab access", () => {
  it("needs both GITLAB_URL and GITLAB_TOKEN", () => {
    expect(
      getAccess({ GITLAB_URL: "https://git.example.com/gitlab", GITLAB_TOKEN: " tok " }),
    ).toEqual({ url: "https://git.example.com/gitlab/", token: "tok" });
    expect(() => getAccess({ GITLAB_URL: "https://git.example.com" })).toThrow(
      "set GITLAB_URL and GITLAB_TOKEN",
    );
    expect(() => getAccess({ GITLAB_URL: "git.example.com", GITLAB_TOKEN: "tok" })).toThrow(
      "GITLAB_URL is not a URL",
    );
  });

  it("sends the token to the instance under its path, and surfaces GraphQL errors", async () => {
    const calls: [string, RequestInit][] = [];
    const gitlab = createGitlabClient(
      () => ({ url: "https://git.example.com/gitlab/", token: "tok" }),
      async (url, init) => {
        calls.push([url, init]);
        return Response.json({ errors: [{ message: "bad" }, { message: "worse" }] });
      },
    );
    await expect(gitlab.gql("query {}", {})).rejects.toThrow("bad; worse");
    const [url, init] = calls[0]!;
    expect(url).toBe("https://git.example.com/gitlab/api/graphql");
    expect(init.headers).toMatchObject({ authorization: "Bearer tok" });
  });

  it("reports no rate limit when the instance sends none", async () => {
    const gitlab = createGitlabClient(
      () => ({ url: GITLAB_URL, token: "tok" }),
      async () => Response.json({ data: { ok: true } }),
    );
    await expect(gitlab.gql("query {}", {})).resolves.toEqual({
      data: { ok: true },
      rateRemaining: null,
    });
  });
});
