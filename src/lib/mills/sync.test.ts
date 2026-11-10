import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CiBranch,
  CiBranchesPage,
  CiJobsPage,
  Forge,
  IssuesPage,
  PageOptions,
} from "../pacts/forge";
import type { CiJob, FetchedIssue, PullStatus } from "../pacts/issues";

import { cachedIssue, DASHBOARD, makeIssue, makeJob, REPO } from "../__fixtures__/issues";
import { Db } from "../links/db/sqlite";
import { ConfigSchema } from "../pacts/config";
import { InvalidError, SyncBusyError } from "../pacts/services";
import { closedSince, nextDue, type SyncDeps, Syncer } from "./sync";

interface ForgeData {
  /** Pages of issues and of PRs; a page's cursor is the index of the next one. */
  issues?: FetchedIssue[][];
  pulls?: FetchedIssue[][];
  remaining?: number;
  /** PRs whose status is conflicting. */
  conflicting?: number[];
  branches?: CiBranch[];
  /** The jobs a job query returns for the branches it is asked for. */
  jobs?: CiJob[];
  /** Branches a job query fails on. */
  failed?: string[];
  /** Repos every issue query fails on, read per query. */
  broken?: Set<string>;
}

/** A forge serving `data`, every method a spy recording what the sync asked for. */
function fakeForge({
  issues = [],
  pulls = [],
  remaining = 5000,
  conflicting = [],
  branches = [],
  jobs = [],
  failed = [],
  broken = new Set(),
}: ForgeData = {}) {
  const paged = (pages: FetchedIssue[][], after: string | null): IssuesPage => {
    const index = after ? Number(after) : 0;
    const hasNextPage = index + 1 < pages.length;
    return {
      issues: pages[index] ?? [],
      hasNextPage,
      endCursor: hasNextPage ? String(index + 1) : null,
      rateRemaining: remaining,
    };
  };
  return {
    issuesPage: vi.fn(async (repo: string, options: PageOptions) => {
      if (broken.has(repo)) throw new Error("boom");
      return paged(issues, options.after);
    }),
    pullsPage: vi.fn(async (_: string, options: PageOptions) => paged(pulls, options.after)),
    pullStatuses: vi.fn(async (_: string, numbers: number[]) => ({
      statuses: numbers.map((number): PullStatus => ({
        number,
        statuses: conflicting.includes(number) ? ["is:conflicting"] : [],
      })),
      rateRemaining: remaining,
    })),
    ciBranchesPage: vi.fn(async (): Promise<CiBranchesPage> => ({
      branches,
      hasNextPage: false,
      endCursor: null,
      rateRemaining: remaining,
    })),
    ciJobs: vi.fn(async (_: string, batch: CiBranch[]): Promise<CiJobsPage> => {
      const names = new Set(batch.map(({ name }) => name));
      return {
        jobs: jobs.filter((job) => names.has(job.branch)),
        failed: failed.filter((name) => names.has(name)),
        rateRemaining: remaining,
      };
    }),
    viewer: vi.fn(async () => "me"),
    repoLabels: vi.fn(async () => [{ name: "bug", color: "ff0000", description: null }]),
  } satisfies Forge;
}

const issues = (...numbers: number[]) => numbers.map((number) => makeIssue({ number }));

const EMPTY_PAGE: IssuesPage = {
  issues: [],
  hasNextPage: false,
  endCursor: null,
  rateRemaining: 5000,
};

const now = new Date("2026-05-01T12:00:00Z");

/** A Syncer over `forge` whose clock stands at `now`, configured with `REPO` alone. */
const syncerWith = (db: Db, forge: Forge, deps: Partial<SyncDeps> = {}) =>
  new Syncer({
    db,
    forge,
    config: () => ConfigSchema.parse({ repos: [REPO] }),
    now: () => now,
    ...deps,
  });

describe("Syncer", () => {
  let db: Db;

  beforeEach(() => {
    db = new Db(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("does a full open-only sync the first time, paging and closing stale rows", async () => {
    db.upsertIssues([makeIssue({ number: 99 })]);
    const forge = fakeForge({ issues: [issues(1, 2), issues(3)] });
    const syncer = syncerWith(db, forge);

    const result = await syncer.syncRepo(REPO);

    expect(result).toEqual({ repo: REPO, full: true, upserted: 3, closed: 1 });
    expect(forge.issuesPage.mock.calls).toEqual([
      [REPO, { since: null, states: "open", after: null }],
      [REPO, { since: null, states: "open", after: "1" }],
    ]);
    expect(cachedIssue(db, REPO, 99)?.state).toBe("CLOSED");
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

  it("also fetches the items closed within the window on a full sync", async () => {
    const forge = fakeForge({ issues: [issues(1)] });
    const syncer = syncerWith(db, forge, {
      config: () =>
        ConfigSchema.parse({ repos: [REPO], dashboards: [{ ...DASHBOARD, closedDays: 7 }] }),
    });

    await syncer.syncRepo(REPO);

    const closed = { since: "2026-04-24T12:00:00.000Z", states: "closed", after: null };
    expect(forge.issuesPage.mock.calls).toEqual([
      [REPO, { since: null, states: "open", after: null }],
      [REPO, closed],
    ]);
    expect(forge.pullsPage.mock.calls.map(([, options]) => options.states)).toEqual([
      "open",
      "closed",
    ]);
  });

  it("syncs incrementally afterwards with an overlapping since and all states", async () => {
    db.setSyncState(REPO, {
      lastSyncAt: "2026-05-01T11:00:00.000Z",
      lastFullSyncAt: "2026-05-01T11:00:00.000Z",
    });
    db.upsertIssues([makeIssue({ number: 5 })]);
    const forge = fakeForge({ issues: [[makeIssue({ number: 5, state: "CLOSED" })]] });
    const syncer = syncerWith(db, forge);

    const result = await syncer.syncRepo(REPO);

    expect(result).toEqual({ repo: REPO, full: false, upserted: 1, closed: 0 });
    expect(forge.issuesPage.mock.calls[0]?.[1]).toMatchObject({
      since: "2026-05-01T10:58:00.000Z",
      states: "all",
    });
    expect(cachedIssue(db, REPO, 5)?.state).toBe("CLOSED");
    expect(db.getSyncState(REPO)?.lastFullSyncAt).toBe("2026-05-01T11:00:00.000Z");
  });

  it("syncs pull requests from the same overlapping since", async () => {
    db.setSyncState(REPO, {
      lastSyncAt: "2026-05-01T11:00:00.000Z",
      lastFullSyncAt: "2026-05-01T11:00:00.000Z",
    });
    const pull = makeIssue({ number: 20, kind: "pr", linked: [{ repo: REPO, number: 1 }] });
    const forge = fakeForge({ pulls: [[pull]] });
    const syncer = syncerWith(db, forge);

    expect(await syncer.syncRepo(REPO)).toMatchObject({ upserted: 1 });
    expect(forge.pullsPage.mock.calls).toEqual([
      [REPO, { since: "2026-05-01T10:58:00.000Z", states: "all", after: null }],
    ]);
    expect(cachedIssue(db, REPO, 20)).toMatchObject({
      kind: "pr",
      linked: [{ repo: REPO, number: 1 }],
    });
  });

  it("keeps open pull requests open on a full sync", async () => {
    const forge = fakeForge({
      issues: [issues(1)],
      pulls: [[makeIssue({ number: 2, kind: "pr" })]],
    });
    const syncer = syncerWith(db, forge);
    expect(await syncer.syncRepo(REPO)).toMatchObject({ full: true, upserted: 2, closed: 0 });
    expect(cachedIssue(db, REPO, 2)?.state).toBe("OPEN");
  });

  it("refreshes the status of every open PR, also those an incremental sync did not page", async () => {
    db.setSyncState(REPO, {
      lastSyncAt: "2026-05-01T11:00:00.000Z",
      lastFullSyncAt: "2026-05-01T11:00:00.000Z",
    });
    db.upsertIssues([makeIssue({ number: 7, kind: "pr" }), makeIssue({ number: 8 })]);
    const forge = fakeForge({ conflicting: [7] });

    await syncerWith(db, forge).syncRepo(REPO);

    expect(cachedIssue(db, REPO, 7)?.statuses).toEqual(["is:conflicting"]);
    expect(forge.pullStatuses.mock.calls).toEqual([[REPO, [7]]]);
  });

  /** Cached open PRs and a recent sync, so the next one is incremental and keeps them open. */
  const openPulls = (count: number) => {
    db.setSyncState(REPO, {
      lastSyncAt: "2026-05-01T11:00:00.000Z",
      lastFullSyncAt: "2026-05-01T11:00:00.000Z",
    });
    db.upsertIssues(
      Array.from({ length: count }, (_, i) => makeIssue({ number: i + 1, kind: "pr" })),
    );
  };

  it("asks for PR statuses 50 at a time", async () => {
    openPulls(51);
    const forge = fakeForge({ conflicting: [51] });
    await syncerWith(db, forge).syncRepo(REPO);
    expect(forge.pullStatuses.mock.calls.map(([, batch]) => batch.length)).toEqual([50, 1]);
    expect(cachedIssue(db, REPO, 51)?.statuses).toEqual(["is:conflicting"]);
  });

  it("aborts between PR status batches when the rate limit is nearly gone", async () => {
    openPulls(51);
    const everyPull = Array.from({ length: 51 }, (_, i) => i + 1);
    const forge = fakeForge({ remaining: 50, conflicting: everyPull });
    const syncer = syncerWith(db, forge);
    await expect(syncer.syncRepo(REPO)).rejects.toThrow(/rate limit/);
    expect(forge.pullStatuses).toHaveBeenCalledTimes(1);
    const flagged = db.listIssues([REPO]).filter((issue) => issue.statuses.length > 0);
    expect(flagged).toHaveLength(50);
    expect(syncer.status().rateRemaining).toBe(50);
  });

  it("reads jobs of the listed branches and replaces the cached ones", async () => {
    db.setCiJobs(REPO, [makeJob({ name: "lint", branch: "old" })]);
    const branches = [
      { name: "main", suites: true },
      { name: "feat/x", suites: false },
    ];
    const job = makeJob({ name: "lint", branch: "feat/x" });
    const forge = fakeForge({ branches, jobs: [job] });

    await syncerWith(db, forge).syncRepo(REPO);

    expect(forge.ciJobs.mock.calls).toEqual([[REPO, branches]]);
    expect(db.listCiJobs([REPO])).toEqual([job]);
  });

  it("keeps the cached jobs of a branch the job query failed on and finishes", async () => {
    const cached = makeJob({ name: "lint", branch: "feat/x" });
    db.setCiJobs(REPO, [cached, { ...cached, branch: "old" }]);
    const forge = fakeForge({
      branches: [{ name: "feat/x", suites: false }],
      failed: ["feat/x"],
    });
    await syncerWith(db, forge).syncRepo(REPO);
    expect(db.listCiJobs([REPO])).toEqual([cached]);
    expect(db.getSyncState(REPO)?.lastSyncAt).toBe(now.toISOString());
  });

  it("keeps a PR's status when a page upserts it again", async () => {
    db.upsertIssues([makeIssue({ number: 7, kind: "pr" })]);
    db.setPullStatuses(REPO, [{ number: 7, statuses: ["is:conflicting", "is:unanswered"] }]);
    db.upsertIssues([makeIssue({ number: 7, kind: "pr", title: "renamed" })]);
    expect(cachedIssue(db, REPO, 7)).toMatchObject({
      title: "renamed",
      statuses: ["is:conflicting", "is:unanswered"],
    });
  });

  it("falls back to a full sync when the last one is older than a day", async () => {
    db.setSyncState(REPO, {
      lastSyncAt: "2026-04-29T11:00:00.000Z",
      lastFullSyncAt: "2026-04-29T11:00:00.000Z",
    });
    const forge = fakeForge();
    await syncerWith(db, forge).syncRepo(REPO);
    expect(forge.issuesPage.mock.calls[0]?.[1]).toMatchObject({ since: null, states: "open" });
  });

  it("keeps a repo's error in its sync state alone, clears the in-flight flag and bumps the version", async () => {
    const syncer = syncerWith(db, fakeForge({ broken: new Set([REPO]) }));
    await expect(syncer.syncRepo(REPO)).rejects.toThrow("boom");
    expect(db.getSyncState(REPO)?.lastError).toBe("boom");
    expect(syncer.status()).toMatchObject({
      version: 1,
      lastError: null,
      inFlight: [],
    });
  });

  it("refuses to overlap a running sync of the same repo", async () => {
    const gate = Promise.withResolvers<IssuesPage>();
    const forge = fakeForge();
    forge.issuesPage.mockReturnValueOnce(gate.promise);
    const syncer = syncerWith(db, forge);
    const running = syncer.syncRepo(REPO);
    await expect(syncer.syncRepo(REPO)).rejects.toBeInstanceOf(SyncBusyError);
    await expect(syncer.syncAll([REPO])).resolves.toBeUndefined();
    expect(syncer.status()).toMatchObject({ runs: 1, version: 0 });
    gate.resolve(EMPTY_PAGE);
    await expect(running).resolves.toMatchObject({ upserted: 0 });
    expect(syncer.status().inFlight).toEqual([]);
  });

  it("keeps a sync-all's early failure past a later success and counts the run", async () => {
    const syncer = syncerWith(db, fakeForge({ broken: new Set(["acme/bad"]) }));
    await syncer.syncAll(["acme/bad", REPO]);
    expect(db.getSyncState(REPO)?.lastSyncAt).not.toBeNull();
    expect(syncer.status()).toMatchObject({ runs: 1, lastError: "acme/bad: boom" });
  });

  it("adds a sync-all's repos to the running one, keeping their full flag", async () => {
    const gate = Promise.withResolvers<IssuesPage>();
    const forge = fakeForge();
    forge.issuesPage.mockReturnValueOnce(gate.promise);
    db.setSyncState("acme/other", {
      lastSyncAt: "2026-05-01T11:00:00.000Z",
      lastFullSyncAt: "2026-05-01T11:00:00.000Z",
    });
    const syncer = syncerWith(db, forge, {
      config: () => ConfigSchema.parse({ repos: [REPO, "acme/other"] }),
    });
    const first = syncer.syncAll([REPO]);
    await vi.waitFor(() => expect(syncer.status().inFlight).toContain(REPO));
    expect(syncer.start(["acme/other"], { full: true })).toBe(1);
    expect(syncer.status()).toMatchObject({ inFlight: [REPO], queued: ["acme/other"] });
    gate.resolve(EMPTY_PAGE);
    await first;
    expect(syncer.status()).toMatchObject({ runs: 1, inFlight: [], queued: [] });
    expect(syncer.start([])).toBe(2);
    await syncer.syncAll([]);
    expect(
      forge.issuesPage.mock.calls
        .filter(([repo]) => repo === "acme/other")
        .map(([, options]) => options.since),
    ).toContain(null);
  });

  it("reports each repo's last sync and error in the status", async () => {
    db.setSyncState("acme/bad", { lastError: "boom" });
    const syncer = syncerWith(db, fakeForge());
    await syncer.syncRepo(REPO);
    expect(syncer.status().repos).toEqual({
      "acme/bad": { lastSyncAt: null, lastError: "boom" },
      [REPO]: { lastSyncAt: now.toISOString(), lastError: null },
    });
  });

  it("aborts when the rate limit is nearly gone and more pages remain", async () => {
    const syncer = syncerWith(db, fakeForge({ issues: [issues(1), issues(2)], remaining: 50 }));
    await expect(syncer.syncRepo(REPO)).rejects.toThrow(/rate limit/);
    expect(cachedIssue(db, REPO, 1)).not.toBeNull();
    expect(cachedIssue(db, REPO, 2)).toBeNull();
  });

  it("fetches the viewer once and exposes it in the status", async () => {
    const forge = fakeForge();
    const syncer = syncerWith(db, forge);
    expect(syncer.status().viewer).toBeNull();
    expect(await syncer.viewer()).toBe("me");
    expect(await syncer.viewer()).toBe("me");
    expect(forge.viewer).toHaveBeenCalledTimes(1);
    expect(syncer.status().viewer).toBe("me");
  });
});

const FRESH = "2026-05-01T11:56:00.000Z";
const STALE = "2026-05-01T11:50:00.000Z";
const STALER = "2026-05-01T11:40:00.000Z";

const due = (attempts: Record<string, string | null>, hiddenRepos: string[] = []) =>
  nextDue(
    { repos: Object.keys(attempts), hiddenRepos, refreshMinutes: 5 },
    attempts,
    now.getTime(),
  );

describe("nextDue", () => {
  it("picks the repo with the oldest attempt", () => {
    expect(due({ "acme/fresh": FRESH, "acme/stale": STALE, "acme/staler": STALER })).toBe(
      "acme/staler",
    );
  });

  it("picks a repo that never synced before any other", () => {
    expect(due({ "acme/stale": STALE, "acme/new": null })).toBe("acme/new");
  });

  it("keeps config order among repos that never synced", () => {
    expect(due({ "acme/b": null, "acme/a": null })).toBe("acme/b");
  });

  it("prefers a due repo that is on over a staler one that is off", () => {
    expect(due({ "acme/off": STALER, "acme/on": STALE }, ["acme/off"])).toBe("acme/on");
  });

  it("picks a repo that is off once every repo that is on is fresh", () => {
    expect(due({ "acme/off": STALE, "acme/on": FRESH }, ["acme/off"])).toBe("acme/off");
  });

  it("picks nothing when no repo is older than the interval", () => {
    expect(due({ "acme/on": FRESH, "acme/off": FRESH }, ["acme/off"])).toBeUndefined();
  });

  it("picks nothing within a slot of the newest attempt", () => {
    const justNow = "2026-05-01T11:59:30.000Z";
    expect(due({ "acme/stale": STALE, "acme/recent": justNow })).toBeUndefined();
  });

  it("picks nothing without repos", () => {
    expect(due({})).toBeUndefined();
  });
});

describe("Syncer.syncDue", () => {
  it("puts a repo that just failed behind the others, though its last success is older", async () => {
    const db = new Db(":memory:");
    const repos = ["acme/bad", "acme/good"];
    db.setSyncState("acme/bad", { lastSyncAt: STALER, lastError: "boom", lastAttemptAt: STALE });
    db.setSyncState("acme/good", { lastSyncAt: STALER, lastAttemptAt: STALER });
    const syncer = syncerWith(db, fakeForge(), {
      config: () => ConfigSchema.parse({ repos, refreshMinutes: 5 }),
    });
    const syncAll = vi.spyOn(syncer, "syncAll").mockResolvedValue();

    await syncer.syncDue();

    expect(syncAll.mock.calls).toEqual([[["acme/good"], { background: true }]]);
    db.close();
  });

  it("skips a tick while a sync-all runs", async () => {
    const db = new Db(":memory:");
    const syncer = syncerWith(db, fakeForge());
    const run = syncer.syncAll([REPO]);
    const syncAll = vi.spyOn(syncer, "syncAll");

    await syncer.syncDue();

    expect(syncAll).not.toHaveBeenCalled();
    await run;
    db.close();
  });

  it("skips a tick while a single-repo sync runs", async () => {
    const db = new Db(":memory:");
    const syncer = syncerWith(db, fakeForge());
    const run = syncer.syncRepo(REPO);
    const syncAll = vi.spyOn(syncer, "syncAll");

    await syncer.syncDue();

    expect(syncAll).not.toHaveBeenCalled();
    await run;
    db.close();
  });

  it("spreads 12 repos over a 5-minute interval, one about every 25 seconds", async () => {
    const db = new Db(":memory:");
    const repos = Array.from({ length: 12 }, (_, index) => `acme/r${index}`);
    let clock = now.getTime();
    const syncer = syncerWith(db, fakeForge(), {
      config: () => ConfigSchema.parse({ repos, refreshMinutes: 5 }),
      now: () => new Date(clock),
    });
    const synced: { repo: string; at: number }[] = [];
    vi.spyOn(syncer, "syncAll").mockImplementation(async ([repo = ""]) => {
      synced.push({ repo, at: clock });
      db.setSyncState(repo, { lastAttemptAt: new Date(clock).toISOString() });
    });

    for (; clock < now.getTime() + 2 * 300_000; clock += 5000) await syncer.syncDue();

    const gaps = synced.slice(1).map(({ at }, index) => at - (synced[index]?.at ?? 0));
    expect(new Set(gaps)).toEqual(new Set([25_000]));
    expect(synced.map(({ repo }) => repo)).toEqual([...repos, ...repos]);
    db.close();
  });

  it("leaves a user run's failure in place when a background run ends", async () => {
    const db = new Db(":memory:");
    const syncer = syncerWith(db, fakeForge({ broken: new Set(["acme/bad"]) }), {
      config: () => ConfigSchema.parse({ repos: ["acme/bad", REPO], refreshMinutes: 5 }),
      now: () => new Date(now.getTime() + (db.getSyncState("acme/bad") ? 200_000 : 0)),
    });
    await syncer.syncAll(["acme/bad"]);

    await syncer.syncDue();

    expect(db.getSyncState(REPO)?.lastSyncAt).not.toBeNull();
    expect(syncer.status()).toMatchObject({ runs: 2, lastError: "acme/bad: boom" });
    db.close();
  });

  it("drops a user run's failure once a background sync recovers that repo", async () => {
    const db = new Db(":memory:");
    const broken = new Set(["acme/bad", "acme/worse"]);
    let clock = now.getTime();
    const syncer = syncerWith(db, fakeForge({ broken }), {
      config: () => ConfigSchema.parse({ repos: ["acme/bad", "acme/worse"], refreshMinutes: 5 }),
      now: () => new Date(clock),
    });
    await syncer.syncAll(["acme/bad", "acme/worse"]);
    expect(syncer.status().lastError).toBe("acme/bad: boom; acme/worse: boom");
    broken.clear();

    clock += 300_000;
    await syncer.syncDue();
    expect(syncer.status().lastError).toBe("acme/worse: boom");

    clock += 300_000;
    await syncer.syncDue();
    expect(syncer.status().lastError).toBeNull();
    db.close();
  });

  it("reports no failure for a repo a later pass of the same run recovers", async () => {
    const db = new Db(":memory:");
    const forge = fakeForge();
    const syncer = syncerWith(db, forge);
    forge.issuesPage.mockImplementationOnce(async () => {
      void syncer.syncAll([REPO]);
      throw new Error("boom");
    });

    await syncer.syncAll([REPO]);

    expect(syncer.status()).toMatchObject({ runs: 1, lastError: null });
    db.close();
  });

  it("drops a user run's failure once its repo leaves the config", async () => {
    const db = new Db(":memory:");
    let repos = ["acme/bad"];
    const syncer = syncerWith(db, fakeForge({ broken: new Set(["acme/bad"]) }), {
      config: () => ConfigSchema.parse({ repos, refreshMinutes: 5 }),
    });
    await syncer.syncAll(repos);
    repos = [REPO];

    await syncer.syncDue();

    expect(syncer.status().lastError).toBeNull();
    db.close();
  });

  it("clears its own error once it picks a repo again", async () => {
    const db = new Db(":memory:");
    let broken = true;
    const syncer = syncerWith(db, fakeForge(), {
      config: () => {
        if (broken) throw new Error("bad json");
        return ConfigSchema.parse({ repos: [REPO] });
      },
    });
    await syncer.syncDue();
    expect(syncer.status().lastError).toBe("config: bad json");
    broken = false;

    await syncer.syncDue();

    expect(syncer.status().lastError).toBeNull();
    db.close();
  });

  it("records a config that fails to load and syncs nothing", async () => {
    const db = new Db(":memory:");
    const syncer = syncerWith(db, fakeForge(), {
      config: () => {
        throw new Error("bad json");
      },
    });
    const syncAll = vi.spyOn(syncer, "syncAll");

    await syncer.syncDue();

    expect(syncAll).not.toHaveBeenCalled();
    expect(syncer.status().lastError).toBe("config: bad json");
    db.close();
  });

  it("records a sync state that fails to load and syncs nothing", async () => {
    const db = new Db(":memory:");
    const syncer = syncerWith(db, fakeForge());
    vi.spyOn(db, "listSyncStates").mockImplementationOnce(() => {
      throw new Error("disk I/O error");
    });
    const syncAll = vi.spyOn(syncer, "syncAll");

    await syncer.syncDue();

    expect(syncAll).not.toHaveBeenCalled();
    expect(syncer.status().lastError).toBe("due repos: disk I/O error");
    db.close();
  });
});

describe("closedSince", () => {
  const at = new Date("2026-05-10T00:00:00Z");

  it("goes back the window's days from now", () => {
    expect(closedSince(7, at)).toBe(Date.parse("2026-05-03T00:00:00Z"));
  });

  it("keeps nothing closed for an empty window", () => {
    expect(closedSince(0, at)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("Syncer.start", () => {
  it("queues every configured repo when none are named", () => {
    const db = new Db(":memory:");
    const syncer = syncerWith(db, fakeForge());
    const syncAll = vi.spyOn(syncer, "syncAll").mockResolvedValue();

    syncer.start(undefined, { full: true });

    expect(syncAll).toHaveBeenCalledWith([REPO], { full: true });
    db.close();
  });

  it("rejects a repo outside the config before queuing anything", () => {
    const db = new Db(":memory:");
    const syncer = syncerWith(db, fakeForge());
    const syncAll = vi.spyOn(syncer, "syncAll");

    expect(() => syncer.start([REPO, "acme/other"])).toThrow(InvalidError);
    expect(syncAll).not.toHaveBeenCalled();
    db.close();
  });
});
