import { describe, expect, it } from "vitest";

import type { SyncStatus } from "../pacts/sync";

import { repoSyncView, syncAge, syncErrors } from "./syncView";

describe("syncAge", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

  it("grades the age in refresh intervals", () => {
    expect(syncAge(ago(10), 5, now)).toBe("fresh");
    expect(syncAge(ago(11), 5, now)).toBe("late");
    expect(syncAge(ago(30), 5, now)).toBe("late");
    expect(syncAge(ago(31), 5, now)).toBe("stale");
  });

  it("counts a repo never synced as stale", () => {
    expect(syncAge(null, 5, now)).toBe("stale");
  });
});

const errorStatus = (over: Partial<SyncStatus>) =>
  ({ lastError: null, repos: {}, ...over }) as SyncStatus;

describe("syncErrors", () => {
  const failing = { "o/a": { lastSyncAt: null, lastError: "boom" } };

  it("reports a failing repo though the status has no error", () => {
    expect(syncErrors(errorStatus({ repos: failing }), ["o/a"])).toEqual(["o/a: boom"]);
  });

  it("ignores a repo outside the config", () => {
    expect(syncErrors(errorStatus({ repos: failing }), ["o/b"])).toEqual([]);
  });

  it("reports an error no repo holds", () => {
    expect(syncErrors(errorStatus({ lastError: "config: bad json" }), ["o/a"])).toEqual([
      "config: bad json",
    ]);
  });

  it("repeats no failure the status already carries", () => {
    const lastError = "o/a: boom; o/b: nope";
    expect(syncErrors(errorStatus({ lastError, repos: failing }), ["o/a"])).toEqual([lastError]);
  });
});

describe("repoSyncView", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");
  const repo = "o/a";
  const status = (over: Partial<SyncStatus> = {}): SyncStatus => ({
    version: 1,
    runs: 0,
    lastSyncAt: null,
    lastError: null,
    rateRemaining: null,
    inFlight: [],
    queued: [],
    repos: { [repo]: { lastSyncAt: new Date(now - 60_000).toISOString(), lastError: null } },
    viewer: null,
    ...over,
  });
  const failing = { [repo]: { lastSyncAt: null, lastError: "boom" } };

  it("grades the health by age when the last sync did not fail", () => {
    expect(repoSyncView(repo, status(), 5, now)).toEqual({
      phase: "idle",
      health: "fresh",
      label: "Sync o/a (synced 1 min ago)",
    });
  });

  it("puts a failed last sync over the age", () => {
    expect(repoSyncView(repo, status({ repos: failing }), 5, now)).toEqual({
      phase: "idle",
      health: "failed",
      label: "Sync o/a (last sync failed: boom)",
    });
  });

  it("puts syncing over queued, and keeps a failure through both", () => {
    const both = status({ inFlight: [repo], queued: [repo], repos: failing });
    expect(repoSyncView(repo, both, 5, now)).toMatchObject({ phase: "syncing", health: "failed" });
    const queued = status({ queued: [repo], repos: failing });
    expect(repoSyncView(repo, queued, 5, now)).toMatchObject({
      phase: "queued",
      health: "failed",
      label: "o/a is queued (last sync failed: boom)",
    });
  });

  it("counts a repo without status as never synced", () => {
    expect(repoSyncView(repo, null, 5, now)).toEqual({
      phase: "idle",
      health: "stale",
      label: "Sync o/a (synced never)",
    });
  });
});
