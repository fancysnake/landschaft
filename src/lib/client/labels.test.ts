import { describe, expect, it } from "vitest";

import type { SyncStatus } from "../pacts/types";

import { repoSyncView, syncAge } from "./labels";

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

  it("takes the tone from the age when idle and not failed", () => {
    expect(repoSyncView(repo, status(), 5, now)).toEqual({
      phase: "idle",
      tone: "fresh",
      failed: false,
      label: "Sync o/a (synced 1 min ago)",
    });
  });

  it("puts a failed last sync over the age", () => {
    expect(repoSyncView(repo, status({ repos: failing }), 5, now)).toEqual({
      phase: "idle",
      tone: "failed",
      failed: true,
      label: "Sync o/a (last sync failed: boom)",
    });
  });

  it("puts syncing over queued, and both over a failure", () => {
    const both = status({ inFlight: [repo], queued: [repo], repos: failing });
    expect(repoSyncView(repo, both, 5, now)).toMatchObject({ phase: "syncing", tone: "syncing" });
    const queued = status({ queued: [repo], repos: failing });
    expect(repoSyncView(repo, queued, 5, now)).toMatchObject({
      phase: "queued",
      tone: "queued",
      failed: true,
      label: "o/a is queued (last sync failed: boom)",
    });
  });

  it("counts a repo without status as never synced", () => {
    expect(repoSyncView(repo, null, 5, now)).toEqual({
      phase: "idle",
      tone: "stale",
      failed: false,
      label: "Sync o/a (synced never)",
    });
  });
});
