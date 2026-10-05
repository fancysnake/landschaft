import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GithubClient } from "./github";
import type { Syncer } from "./sync";

import { DASHBOARD, makeIssue, REPO } from "./__fixtures__/issues";
import { Db } from "./db";
import { moveIssue, MoveError } from "./move";

const dashboard = {
  ...DASHBOARD,
  swimlanes: [
    {
      id: "review",
      name: "In review",
      labels: ["is:has-pr"],
      match: "any" as const,
      kind: "issue" as const,
      hideBlocked: false,
    },
    ...DASHBOARD.swimlanes,
  ],
};

describe("moveIssue", () => {
  let db: Db;
  let calls: string[];
  let deps: Parameters<typeof moveIssue>[0];

  beforeEach(() => {
    db = new Db(":memory:");
    db.upsertIssues([
      makeIssue({ number: 1 }),
      makeIssue({ number: 10, kind: "pr", linked: [{ repo: REPO, number: 1 }] }),
    ]);
    calls = [];
    const gh = {
      rest: async (method: string, path: string) => {
        calls.push(`${method} ${path}`);
        return null;
      },
    } as unknown as GithubClient;
    const syncer = { bump: () => {}, syncIssue: async () => null } as unknown as Syncer;
    deps = { db, gh, syncer };
  });

  afterEach(() => {
    db.close();
  });

  const move = (toLane: string, toCol: string) =>
    moveIssue(deps, dashboard, {
      dashboardId: dashboard.id,
      repo: REPO,
      number: 1,
      from: { laneId: "review", colId: "todo" },
      to: { laneId: toLane, colId: toCol },
    });

  it("moves an issue an open PR closes between columns of an is:has-pr lane", async () => {
    const result = await move("review", "doing");
    expect(result.add).toEqual(["phase:doing"]);
    expect(calls).toEqual([`POST /repos/${REPO}/issues/1/labels`]);
  });

  it("refuses to move it out of the is:has-pr lane, where it would snap back", async () => {
    await expect(move("high", "todo")).rejects.toThrow(MoveError);
    expect(calls).toEqual([]);
  });
});
