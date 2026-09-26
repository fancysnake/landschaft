import type { Dashboard, Filters, Match, SortBy, SortDir } from "../schema";

import { type Board, type Card, cellKey, type Epic, type Issue, issueKey } from "../types";

export interface Group {
  id: string;
  labels: string[];
  /** Defaults to "any". */
  match?: Match;
}

function matches(group: Group, labelNames: Set<string>): boolean {
  if (group.labels.length === 0) return false;
  return group.match === "all"
    ? group.labels.every((label) => labelNames.has(label))
    : group.labels.some((label) => labelNames.has(label));
}

/** The labels a group needs an issue to carry: all of them, or just the first. */
function wantedLabels(group: Group): string[] {
  return group.match === "all" ? group.labels : group.labels.slice(0, 1);
}

/**
 * First group (in order) whose labels the issue satisfies (any or all of them, per
 * `match`); otherwise the catch-all (a group with no labels), wherever it sits in the
 * list; otherwise null.
 */
export function placeIn<T extends Group>(groups: T[], labelNames: Set<string>): T | null {
  const labeled = groups.find((group) => matches(group, labelNames));
  if (labeled) return labeled;
  return groups.find((group) => group.labels.length === 0) ?? null;
}

/** Blocked while any blocker is open. Prefers the blocker's cached row over the snapshot state. */
export function isBlocked(issue: Issue, byKey: Map<string, Issue>): boolean {
  if (issue.blockedByTotal > issue.blockedBy.length) return true;
  return issue.blockedBy.some(
    (blocker) =>
      (byKey.get(issueKey(blocker.repo, blocker.number))?.state ?? blocker.state) === "OPEN",
  );
}

const keyOf = (ref: { repo: string; number: number }): string => issueKey(ref.repo, ref.number);

/** Keys of the epic's blockers, its sub-issues and the issues it blocks. */
function relatedTo(epicKey: string, byKey: Map<string, Issue>): Set<string> {
  const issues = [...byKey.values()];
  return new Set([
    ...(byKey.get(epicKey)?.blockedBy ?? []).map(keyOf),
    ...issues.filter((issue) => issue.parent && keyOf(issue.parent) === epicKey).map(keyOf),
    ...issues.filter((issue) => issue.blockedBy.some((b) => keyOf(b) === epicKey)).map(keyOf),
  ]);
}

/** Text, assignee, label and epic filters as one predicate; an unset filter passes everything. */
function issueFilter(filters: Filters, byKey: Map<string, Issue>): (issue: Issue) => boolean {
  const query = filters.q?.trim().toLowerCase();
  const related = filters.epic ? relatedTo(filters.epic, byKey) : null;
  return (issue) =>
    (!query || `${issue.number} ${issue.title}`.toLowerCase().includes(query)) &&
    (!filters.assignee || issue.assignees.some((a) => a.login === filters.assignee)) &&
    (!filters.label || issue.labels.some((l) => l.name === filters.label)) &&
    (!related || related.has(keyOf(issue)));
}

function compareBy(by: SortBy, dir: SortDir) {
  const field = by === "created" ? "createdAt" : "updatedAt";
  const sign = dir === "asc" ? 1 : -1;
  return (a: Card | Epic | Issue, b: Card | Epic | Issue): number => {
    const left = a[field as keyof typeof a] as string;
    const right = b[field as keyof typeof b] as string;
    return left < right ? -sign : left > right ? sign : 0;
  };
}

function inScope(dashboard: Dashboard, viewer: string | null): (issue: Issue) => boolean {
  if (dashboard.scope !== "mine" || viewer === null) return () => true;
  return (issue) =>
    issue.author === viewer || issue.assignees.some((assignee) => assignee.login === viewer);
}

/**
 * Lays the open issues out on the dashboard's grid. `viewer` is the token's login; with
 * scope "mine" only issues they authored or are assigned to take part.
 */
export function buildBoard(
  issues: Issue[],
  dashboard: Dashboard,
  filters: Filters = {},
  viewer: string | null = null,
): Board {
  const byKey = new Map(issues.map((issue) => [issueKey(issue.repo, issue.number), issue]));
  const mine = inScope(dashboard, viewer);
  const wanted = issueFilter(filters, byKey);
  const open = issues.filter((issue) => issue.state === "OPEN" && mine(issue));
  const structural = new Set<string>([
    ...dashboard.swimlanes.flatMap((lane) => lane.labels),
    ...dashboard.columns.flatMap((column) => column.labels),
    ...(dashboard.epicLabel ? [dashboard.epicLabel] : []),
  ]);
  const sort = { by: filters.sort ?? dashboard.sort.by, dir: filters.dir ?? dashboard.sort.dir };

  const board: Board = {
    cells: {},
    laneTotals: {},
    hiddenBlocked: {},
    epics: [],
    unplaced: 0,
    assignees: [],
    labels: [],
    sort,
  };
  for (const lane of dashboard.swimlanes) {
    board.laneTotals[lane.id] = 0;
    board.hiddenBlocked[lane.id] = 0;
    for (const column of dashboard.columns) board.cells[cellKey(lane.id, column.id)] = [];
  }

  const assignees = new Set<string>();
  const labels = new Set<string>();
  const epicIssues: Issue[] = [];

  for (const issue of open) {
    for (const assignee of issue.assignees) assignees.add(assignee.login);
    for (const label of issue.labels) if (!structural.has(label.name)) labels.add(label.name);

    const isEpic =
      dashboard.epicLabel !== undefined &&
      issue.labels.some((label) => label.name === dashboard.epicLabel);
    if (isEpic) epicIssues.push(issue);

    if (!wanted(issue)) continue;

    const names = new Set(issue.labels.map((label) => label.name));
    const lane = placeIn(dashboard.swimlanes, names);
    const column = placeIn(dashboard.columns, names);
    if (!lane || !column) {
      board.unplaced += 1;
      continue;
    }
    const blocked = isBlocked(issue, byKey);
    if (lane.hideBlocked && blocked) {
      board.hiddenBlocked[lane.id] = (board.hiddenBlocked[lane.id] ?? 0) + 1;
      continue;
    }
    board.cells[cellKey(lane.id, column.id)]!.push({
      key: issueKey(issue.repo, issue.number),
      repo: issue.repo,
      number: issue.number,
      title: issue.title,
      url: issue.url,
      assignees: issue.assignees,
      labels: issue.labels.filter((label) => !structural.has(label.name)),
      progress: issue.subIssues.total > 0 ? issue.subIssues : null,
      blocked,
      isEpic,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    });
    board.laneTotals[lane.id] = (board.laneTotals[lane.id] ?? 0) + 1;
  }

  const compare = compareBy(sort.by, sort.dir);
  for (const [key, cards] of Object.entries(board.cells))
    board.cells[key] = cards.toSorted(compare);
  board.epics = epicIssues.toSorted(compare).map((issue) => ({
    key: issueKey(issue.repo, issue.number),
    repo: issue.repo,
    number: issue.number,
    title: issue.title,
    url: issue.url,
    progress: issue.subIssues.total > 0 ? issue.subIssues : null,
  }));
  board.assignees = [...assignees].toSorted();
  board.labels = [...labels].toSorted();
  return board;
}

export interface Position {
  lane: Group;
  col: Group;
}

/**
 * Labels to add/remove so the issue lands in `to`. Per axis that changed: drop the
 * source group's labels the issue carries, add what the target group needs (its first
 * label, or every label for an "all" group; nothing for a catch-all). A label that the
 * target still needs is never removed.
 */
export function labelDiffForMove(
  issueLabels: string[],
  from: Position,
  to: Position,
): { add: string[]; remove: string[] } {
  const add = new Set<string>();
  const remove = new Set<string>();
  const keep = new Set<string>();
  for (const [source, target] of [
    [from.lane, to.lane],
    [from.col, to.col],
  ] as const) {
    if (source.id === target.id) {
      for (const label of target.labels) keep.add(label);
      continue;
    }
    for (const label of source.labels) if (issueLabels.includes(label)) remove.add(label);
    for (const wanted of wantedLabels(target)) {
      keep.add(wanted);
      if (!issueLabels.includes(wanted)) add.add(wanted);
    }
  }
  for (const label of keep) remove.delete(label);
  return { add: [...add], remove: [...remove] };
}
