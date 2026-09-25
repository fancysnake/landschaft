import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Config } from "../schema";
import type { GithubClient, IssueNode } from "./github";

import { makeIssue, REPO } from "./__fixtures__/issues";
import { Db } from "./db";
import { startScheduler, SyncBusyError, Syncer } from "./sync";

function toNode(number: number, state: "OPEN" | "CLOSED" = "OPEN"): IssueNode {
  const issue = makeIssue({ number, state });
  return {
    id: issue.nodeId,
    number,
    title: issue.title,
    state,
    url: issue.url,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    closedAt: null,
    issueType: null,
    author: null,
    labels: { nodes: [] },
    assignees: { nodes: [] },
    parent: null,
    subIssuesSummary: { total: 0, completed: 0, percentCompleted: 0 },
    issueDependenciesSummary: { totalBlockedBy: 0 },
    blockedBy: { nodes: [] },
  };
}

interface Call {
  query: string;
  variables: Record<string, unknown>;
}

function fakeGithub(pages: IssueNode[][], remaining = 5000): { gh: GithubClient; calls: Call[] } {
  const calls: Call[] = [];
  const gh: GithubClient = {
    async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
      calls.push({ query, variables });
      if (query.includes("query Labels")) {
        return {
          repository: {
            labels: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [{ name: "bug", color: "ff0000", description: null }],
            },
          },
        } as T;
      }
      if (query.includes("query Viewer")) {
        return { viewer: { login: "me" } } as T;
      }
      if (query.includes("query Issue(")) {
        return { repository: { issue: toNode(variables.number as number) } } as T;
      }
      const index = variables.after ? Number(variables.after) : 0;
      const nodes = pages[index] ?? [];
      const hasNextPage = index + 1 < pages.length;
      return {
        rateLimit: { remaining },
        repository: {
          issues: {
            pageInfo: { hasNextPage, endCursor: hasNextPage ? String(index + 1) : null },
            nodes,
          },
        },
      } as T;
    },
    async rest() {
      return null;
    },
  };
  return { gh, calls };
}

const pageCalls = (calls: Call[]) => calls.filter((c) => c.query.includes("query IssuesPage"));

const deferred = () => Promise.withResolvers<unknown>();

describe("Syncer", () => {
  let db: Db;
  const now = new Date("2026-05-01T12:00:00Z");

  beforeEach(() => {
    db = new Db(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("does a full open-only sync the first time, paging and closing stale rows", async () => {
    db.upsertIssues([makeIssue({ number: 99 })]);
    const { gh, calls } = fakeGithub([[toNode(1), toNode(2)], [toNode(3)]]);
    const syncer = new Syncer({ db, gh, now: () => now });

    const result = await syncer.syncRepo(REPO);

    expect(result).toEqual({ repo: REPO, full: true, upserted: 3, closed: 1 });
    expect(pageCalls(calls).map((c) => c.variables)).toEqual([
      { owner: "acme", name: "app", since: null, states: ["OPEN"], after: null },
      { owner: "acme", name: "app", since: null, states: ["OPEN"], after: "1" },
    ]);
    expect(db.getIssue(REPO, 99)?.state).toBe("CLOSED");
    expect(db.listLabels([REPO]).map((l) => l.name)).toEqual(["bug"]);
    expect(db.getSyncState(REPO)).toMatchObject({
      lastSyncAt: "2026-05-01T12:00:00.000Z",
      lastFullSyncAt: "2026-05-01T12:00:00.000Z",
      lastError: null,
    });
    expect(syncer.status()).toMatchObject({
      version: 1,
      lastSyncAt: "2026-05-01T12:00:00.000Z",
      rateRemaining: 5000,
    });
  });

  it("syncs incrementally afterwards with an overlapping since and all states", async () => {
    db.setSyncState(REPO, {
      lastSyncAt: "2026-05-01T11:00:00.000Z",
      lastFullSyncAt: "2026-05-01T11:00:00.000Z",
    });
    db.upsertIssues([makeIssue({ number: 5 })]);
    const { gh, calls } = fakeGithub([[toNode(5, "CLOSED")]]);
    const syncer = new Syncer({ db, gh, now: () => now });

    const result = await syncer.syncRepo(REPO);

    expect(result).toEqual({ repo: REPO, full: false, upserted: 1, closed: 0 });
    expect(pageCalls(calls)[0]?.variables).toMatchObject({
      since: "2026-05-01T10:58:00.000Z",
      states: null,
    });
    expect(db.getIssue(REPO, 5)?.state).toBe("CLOSED");
    expect(db.getSyncState(REPO)?.lastFullSyncAt).toBe("2026-05-01T11:00:00.000Z");
  });

  it("falls back to a full sync when the last one is older than a day", async () => {
    db.setSyncState(REPO, {
      lastSyncAt: "2026-04-29T11:00:00.000Z",
      lastFullSyncAt: "2026-04-29T11:00:00.000Z",
    });
    const { gh, calls } = fakeGithub([[]]);
    const syncer = new Syncer({ db, gh, now: () => now });
    await syncer.syncRepo(REPO);
    expect(pageCalls(calls)[0]?.variables).toMatchObject({ since: null, states: ["OPEN"] });
  });

  it("records errors, clears the in-flight flag and still bumps the version", async () => {
    const gh: GithubClient = {
      async gql() {
        throw new Error("boom");
      },
      async rest() {
        return null;
      },
    };
    const syncer = new Syncer({ db, gh, now: () => now });
    await expect(syncer.syncRepo(REPO)).rejects.toThrow("boom");
    expect(db.getSyncState(REPO)?.lastError).toBe("boom");
    expect(syncer.status()).toMatchObject({
      version: 1,
      lastError: "acme/app: boom",
      inFlight: [],
    });
  });

  it("refuses to overlap a running sync of the same repo", async () => {
    const gate = deferred();
    const { gh: labelsOnly } = fakeGithub([]);
    const gh: GithubClient = {
      gql: <T>(query: string, variables: Record<string, unknown>): Promise<T> =>
        query.includes("query Labels")
          ? labelsOnly.gql<T>(query, variables)
          : (gate.promise as Promise<T>),
      async rest() {
        return null;
      },
    };
    const syncer = new Syncer({ db, gh, now: () => now });
    const running = syncer.syncRepo(REPO);
    await expect(syncer.syncRepo(REPO)).rejects.toBeInstanceOf(SyncBusyError);
    expect(await syncer.syncAll([REPO])).toEqual([]);
    gate.resolve({
      rateLimit: { remaining: 5000 },
      repository: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } },
    });
    await expect(running).resolves.toMatchObject({ upserted: 0 });
    expect(syncer.inFlight.size).toBe(0);
  });

  it("aborts when the rate limit is nearly gone and more pages remain", async () => {
    const { gh } = fakeGithub([[toNode(1)], [toNode(2)]], 50);
    const syncer = new Syncer({ db, gh, now: () => now });
    await expect(syncer.syncRepo(REPO)).rejects.toThrow(/rate limit/);
    expect(db.getIssue(REPO, 1)).not.toBeNull();
    expect(db.getIssue(REPO, 2)).toBeNull();
  });

  it("fetches the viewer once and exposes it in the status", async () => {
    const { gh, calls } = fakeGithub([]);
    const syncer = new Syncer({ db, gh, now: () => now });
    expect(syncer.status().viewer).toBeNull();
    expect(await syncer.viewer()).toBe("me");
    expect(await syncer.viewer()).toBe("me");
    expect(calls.filter((c) => c.query.includes("query Viewer"))).toHaveLength(1);
    expect(syncer.status().viewer).toBe("me");
  });

  it("refetches a single issue and bumps the version", async () => {
    const { gh } = fakeGithub([]);
    const syncer = new Syncer({ db, gh, now: () => now });
    const issue = await syncer.syncIssue(REPO, 7);
    expect(issue?.number).toBe(7);
    expect(db.getIssue(REPO, 7)).not.toBeNull();
    expect(syncer.version).toBe(1);
  });
});

describe("startScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("syncs due repos on each tick and skips fresh ones", async () => {
    const db = new Db(":memory:");
    db.setSyncState("acme/fresh", {
      lastSyncAt: "2026-05-01T11:59:30.000Z",
      lastFullSyncAt: "2026-05-01T11:59:30.000Z",
    });
    const { gh, calls } = fakeGithub([[]]);
    const syncer = new Syncer({ db, gh });
    const config: Config = {
      dashboards: [
        {
          id: "d",
          name: "D",
          repos: ["acme/due", "acme/fresh"],
          scope: "all",
          sort: { by: "updated", dir: "desc" },
          refreshMinutes: 5,
          swimlanes: [{ id: "a", name: "A", labels: [], match: "any", hideBlocked: false }],
          columns: [{ id: "c", name: "C", labels: [], match: "any" }],
        },
      ],
    };
    const stop = startScheduler(syncer, () => config, { tickMs: 60_000, firstDelayMs: 0 });

    await vi.advanceTimersByTimeAsync(0);
    expect(pageCalls(calls).length).toBe(1);
    expect(db.getSyncState("acme/due")?.lastSyncAt).not.toBeNull();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(pageCalls(calls).length).toBe(1);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(pageCalls(calls).length).toBeGreaterThanOrEqual(3);

    stop();
    const before = calls.length;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(calls.length).toBe(before);
    db.close();
  });
});
