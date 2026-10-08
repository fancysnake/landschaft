import type { Dashboard } from "../../schema";
import type { Issue } from "../../types";
import type { Db } from "../db";

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

export const DASHBOARD: Dashboard = {
  id: "main",
  name: "Main",
  repos: [REPO],
  users: [],
  epicLabel: "epic",
  sort: { by: "updated", dir: "desc" },
  refreshMinutes: 5,
  swimlanes: [
    {
      id: "high",
      name: "High",
      labels: ["prio:high"],
      match: "any",
      kind: "any",
      hideBlocked: false,
    },
    { id: "low", name: "Low", labels: ["prio:low"], match: "any", kind: "any", hideBlocked: true },
    { id: "rest", name: "Rest", labels: [], match: "any", kind: "any", hideBlocked: false },
  ],
  columns: [
    { id: "todo", name: "Todo", labels: [], match: "any", kind: "any" },
    { id: "doing", name: "Doing", labels: ["phase:doing"], match: "any", kind: "any" },
    {
      id: "done",
      name: "Done",
      labels: ["phase:done", "phase:shipped"],
      match: "any",
      kind: "any",
    },
  ],
};

/** The cached item `repo#number`, or null. */
export function cachedIssue(db: Db, repo: string, number: number): Issue | null {
  return db.listIssues([repo]).find((issue) => issue.number === number) ?? null;
}
