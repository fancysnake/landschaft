import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { label, makeIssue, REPO } from "./__fixtures__/issues";
import { Db } from "./db";

describe("Db migration", () => {
  it("adds the author column to a pre-existing database and forces a full resync", () => {
    const dir = mkdtempSync(join(tmpdir(), "landschaft-db-"));
    const file = join(dir, "old.db");
    const old = new DatabaseSync(file);
    old.exec(`
      CREATE TABLE issues (repo TEXT NOT NULL, number INTEGER NOT NULL, node_id TEXT NOT NULL,
        title TEXT NOT NULL, state TEXT NOT NULL, url TEXT NOT NULL, issue_type TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, closed_at TEXT,
        labels_json TEXT NOT NULL DEFAULT '[]', assignees_json TEXT NOT NULL DEFAULT '[]',
        parent_repo TEXT, parent_number INTEGER, sub_total INTEGER NOT NULL DEFAULT 0,
        sub_completed INTEGER NOT NULL DEFAULT 0, sub_percent INTEGER NOT NULL DEFAULT 0,
        blocked_by_total INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (repo, number));
      CREATE TABLE sync_state (repo TEXT PRIMARY KEY, last_sync_at TEXT, last_full_sync_at TEXT,
        last_error TEXT, updated_at TEXT);
      INSERT INTO sync_state (repo, last_sync_at) VALUES ('acme/app', '2026-01-01T00:00:00Z');
    `);
    old.close();

    const db = new Db(file);
    expect(db.getSyncState("acme/app")).toBeNull();
    db.upsertIssues([makeIssue({ number: 1, author: "ann" })]);
    expect(db.getIssue(REPO, 1)?.author).toBe("ann");
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("Db", () => {
  let db: Db;

  beforeEach(() => {
    db = new Db(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("upserts issues idempotently and updates changed fields", () => {
    const issue = makeIssue({ number: 1, labels: [label("bug")], author: "ann" });
    db.upsertIssues([issue, issue]);
    expect(db.listIssues([REPO])).toEqual([issue]);

    db.upsertIssues([
      { ...issue, title: "Renamed", state: "CLOSED", closedAt: "2026-03-01T00:00:00Z" },
    ]);
    expect(db.getIssue(REPO, 1)).toMatchObject({ title: "Renamed", state: "CLOSED" });
    expect(db.listIssues([REPO])).toHaveLength(1);
  });

  it("rewrites blockers on every upsert", () => {
    const issue = makeIssue({
      number: 2,
      blockedBy: [
        { repo: REPO, number: 1, state: "OPEN" },
        { repo: "acme/lib", number: 7, state: "CLOSED" },
      ],
      blockedByTotal: 2,
    });
    db.upsertIssues([issue]);
    expect(db.getIssue(REPO, 2)?.blockedBy).toEqual(issue.blockedBy);

    db.upsertIssues([
      { ...issue, blockedBy: [{ repo: REPO, number: 1, state: "CLOSED" }], blockedByTotal: 1 },
    ]);
    expect(db.getIssue(REPO, 2)?.blockedBy).toEqual([{ repo: REPO, number: 1, state: "CLOSED" }]);
    expect(db.listIssues([REPO])[0]?.blockedBy).toEqual([
      { repo: REPO, number: 1, state: "CLOSED" },
    ]);
  });

  it("lists only the requested repos", () => {
    db.upsertIssues([makeIssue({ number: 1 }), makeIssue({ number: 1, repo: "acme/lib" })]);
    expect(db.listIssues(["acme/lib"]).map((i) => i.repo)).toEqual(["acme/lib"]);
    expect(db.listIssues([REPO, "acme/lib"])).toHaveLength(2);
    expect(db.listIssues([])).toEqual([]);
  });

  it("closes open issues a full sync did not see", () => {
    db.upsertIssues([
      makeIssue({ number: 1 }),
      makeIssue({ number: 2 }),
      makeIssue({ number: 3, state: "CLOSED" }),
      makeIssue({ number: 1, repo: "acme/lib" }),
    ]);
    expect(db.closeMissing(REPO, new Set([2]))).toBe(1);
    expect(db.getIssue(REPO, 1)?.state).toBe("CLOSED");
    expect(db.getIssue(REPO, 2)?.state).toBe("OPEN");
    expect(db.getIssue("acme/lib", 1)?.state).toBe("OPEN");
    expect(db.closeMissing(REPO, new Set([2]))).toBe(0);
  });

  it("patches labels in place", () => {
    db.upsertIssues([makeIssue({ number: 1, labels: [label("a")] })]);
    db.patchLabels(REPO, 1, [label("b")]);
    expect(db.getIssue(REPO, 1)?.labels).toEqual([label("b")]);
  });

  it("replaces the label catalogue per repo", () => {
    db.upsertLabels(REPO, [{ name: "bug", color: "ff0000", description: null }]);
    db.upsertLabels("acme/lib", [{ name: "docs", color: "00ff00", description: "Docs" }]);
    db.upsertLabels(REPO, [{ name: "feature", color: "0000ff", description: null }]);
    expect(db.listLabels([REPO, "acme/lib"])).toEqual([
      { repo: "acme/lib", name: "docs", color: "00ff00", description: "Docs" },
      { repo: REPO, name: "feature", color: "0000ff", description: null },
    ]);
  });

  it("stores sync state as a patch", () => {
    expect(db.getSyncState(REPO)).toBeNull();
    db.setSyncState(REPO, {
      lastSyncAt: "2026-01-01T00:00:00Z",
      lastFullSyncAt: "2026-01-01T00:00:00Z",
    });
    db.setSyncState(REPO, { lastError: "boom" });
    expect(db.getSyncState(REPO)).toEqual({
      repo: REPO,
      lastSyncAt: "2026-01-01T00:00:00Z",
      lastFullSyncAt: "2026-01-01T00:00:00Z",
      lastError: "boom",
      updatedAt: null,
    });
  });
});
