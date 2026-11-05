import type { Db } from "../links/db/sqlite";
import type { BoardDashboard, Column, Swimlane } from "../pacts/config";
import type { CiJob, Issue, Snapshot } from "../pacts/issues";
import type { Audience } from "../pacts/views";

import { newSwimlane } from "../pacts/config";

export const REPO = "acme/app";

export function makeIssue(overrides: Partial<Issue> & { number: number }): Issue {
  const { number } = overrides;
  return {
    kind: "issue",
    repo: REPO,
    nodeId: `I_${number}`,
    title: `Issue ${number}`,
    state: "OPEN",
    url: `https://github.com/${REPO}/issues/${number}`,
    issueType: null,
    author: null,
    createdAt: `2026-01-${String(number).padStart(2, "0")}T00:00:00Z`,
    updatedAt: `2026-02-${String(number).padStart(2, "0")}T00:00:00Z`,
    closedAt: null,
    labels: [],
    assignees: [],
    parent: null,
    subIssues: { total: 0, completed: 0, percent: 0 },
    blockedBy: [],
    blockedByTotal: 0,
    linked: [],
    statuses: [],
    ...overrides,
  };
}

export function label(name: string): { name: string; color: string } {
  return { name, color: "cccccc" };
}

export function makeLane(overrides: Partial<Swimlane> & { id: string }): Swimlane {
  return { ...newSwimlane(overrides.id, overrides.id), ...overrides };
}

export function makeColumn(overrides: Partial<Column> & { id: string; filter: string }): Column {
  return { name: overrides.id, unranked: false, ...overrides };
}

export const DASHBOARD: BoardDashboard = {
  type: "board",
  id: "main",
  name: "Main",
  filter: "",
  sort: { by: "updated", dir: "desc" },
  closedDays: 0,
  swimlanes: [
    makeLane({ id: "high", filter: "label:prio:high" }),
    makeLane({ id: "low", filter: "label:prio:low", hideBlocked: true }),
    makeLane({ id: "rest", filter: "other" }),
  ],
  columns: [
    makeColumn({ id: "todo", name: "Todo", filter: "other" }),
    makeColumn({ id: "doing", name: "Doing", filter: "label:phase:doing" }),
    makeColumn({ id: "done", name: "Done", filter: "label:phase:done|phase:shipped" }),
  ],
};

/** The cached item `repo#number`, or null. */
export function cachedIssue(db: Db, repo: string, number: number): Issue | null {
  return db.listIssues([repo]).find((issue) => issue.number === number) ?? null;
}

export function makeJob(overrides: Partial<CiJob> & { name: string }): CiJob {
  return {
    repo: REPO,
    branch: "feat/x",
    workflow: "CI",
    url: `https://github.com/${REPO}/actions/runs/1`,
    failedAt: "2026-02-15T00:00:00Z",
    authors: ["ann"],
    pr: null,
    ...overrides,
  };
}

export function snapshot(issues: Issue[], jobs: CiJob[] = []): Snapshot {
  return { issues, jobs };
}

/**
 * No global users, no known viewer and no repo switched off: every item is in scope and `@me`
 * matches nothing.
 */
export const EVERYONE: Audience = { users: [], viewer: null, hidden: [] };
