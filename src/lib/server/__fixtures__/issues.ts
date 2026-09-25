import type { Dashboard } from "../../schema";
import type { Issue } from "../../types";

export const REPO = "acme/app";

export function makeIssue(overrides: Partial<Issue> & { number: number }): Issue {
  const { number } = overrides;
  return {
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
  scope: "all",
  epicLabel: "epic",
  sort: { by: "updated", dir: "desc" },
  refreshMinutes: 5,
  swimlanes: [
    { id: "high", name: "High", labels: ["prio:high"], match: "any", hideBlocked: false },
    { id: "low", name: "Low", labels: ["prio:low"], match: "any", hideBlocked: true },
    { id: "rest", name: "Rest", labels: [], match: "any", hideBlocked: false },
  ],
  columns: [
    { id: "todo", name: "Todo", labels: [], match: "any" },
    { id: "doing", name: "Doing", labels: ["phase:doing"], match: "any" },
    { id: "done", name: "Done", labels: ["phase:done", "phase:shipped"], match: "any" },
  ],
};
