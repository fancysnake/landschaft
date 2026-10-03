import {
  AXIS_PRECEDENCE,
  type Column,
  type Dashboard,
  type Filters,
  fitsKind,
  isCatchAll,
  isStatusLabel,
  type KindFilter,
  type Match,
  type Precedence,
  selectedRepos,
  type SortBy,
  type SortDir,
  type Swimlane,
} from "../schema";
import {
  type Board,
  type Card,
  cellKey,
  type Epic,
  type Issue,
  issueKey,
  type IssueKind,
  type IssueRef,
} from "../types";

export interface Group {
  id: string;
  labels: string[];
  /** Defaults to "any". */
  match?: Match;
  /** Defaults to "any"; what tells a kind-only group from the catch-all. */
  kind?: KindFilter;
}

/**
 * The item's label names plus the PR status labels that hold for it; a real GitHub label
 * named like a status does not count as one.
 */
export function matchLabels(issue: Pick<Issue, "labels" | "statuses">): Set<string> {
  const names = issue.labels.map((label) => label.name).filter((name) => !isStatusLabel(name));
  return new Set([...names, ...issue.statuses]);
}

function matches(group: Group, labelNames: Set<string>): boolean {
  // A kind-only group (no labels, a kind set) takes every item, in list order.
  if (group.labels.length === 0) return (group.kind ?? "any") !== "any";
  return group.match === "all"
    ? group.labels.every((label) => labelNames.has(label))
    : group.labels.some((label) => labelNames.has(label));
}

/** The labels a move adds for a group: all of them, or just the first; never status labels. */
function wantedLabels(group: Group): string[] {
  const real = group.labels.filter((label) => !isStatusLabel(label));
  return group.match === "all" ? real : real.slice(0, 1);
}

/**
 * The `first` (or `last`) group in the list whose labels the issue satisfies (any or all of
 * them, per `match`; a kind-only group needs none); otherwise the catch-all (no labels, any
 * kind), wherever it sits in the list; otherwise null. Groups of the wrong kind are the
 * caller's to drop.
 */
export function placeIn<T extends Group>(
  groups: T[],
  labelNames: Set<string>,
  precedence: Precedence = "first",
): T | null {
  const hit = (group: T) => matches(group, labelNames);
  const labeled = precedence === "first" ? groups.find(hit) : groups.findLast(hit);
  if (labeled) return labeled;
  return groups.find(isCatchAll) ?? null;
}

/**
 * The lane and column (among those taking `kind`) an item carrying `labelNames` lands in,
 * each picked by its axis's `AXIS_PRECEDENCE`.
 */
export function placeCard(
  dashboard: Pick<Dashboard, "swimlanes" | "columns">,
  kind: IssueKind,
  labelNames: Set<string>,
): { lane: Swimlane; column: Column } | null {
  const takes = (group: { kind: KindFilter }) => fitsKind(group.kind, kind);
  const lane = placeIn(dashboard.swimlanes.filter(takes), labelNames, AXIS_PRECEDENCE.swimlanes);
  const column = placeIn(dashboard.columns.filter(takes), labelNames, AXIS_PRECEDENCE.columns);
  return lane && column ? { lane, column } : null;
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

/**
 * Keys of the epic's blockers, its sub-issues and the issues it blocks, plus the PRs
 * linked to the epic or to any of those.
 */
function relatedTo(epicKey: string, byKey: Map<string, Issue>): Set<string> {
  const issues = [...byKey.values()];
  const base = new Set([
    ...(byKey.get(epicKey)?.blockedBy ?? []).map(keyOf),
    ...issues.filter((issue) => issue.parent && keyOf(issue.parent) === epicKey).map(keyOf),
    ...issues.filter((issue) => issue.blockedBy.some((b) => keyOf(b) === epicKey)).map(keyOf),
  ]);
  const hits = (ref: IssueRef) => keyOf(ref) === epicKey || base.has(keyOf(ref));
  const linked = issues.filter((issue) => issue.linked.some(hits)).map(keyOf);
  return new Set([...base, ...linked]);
}

/**
 * Text, assignee, label and epic filters as one predicate; an unset filter passes
 * everything.
 */
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
 * scope "mine" only issues they authored or are assigned to take part. `starred` epic keys
 * lead the epic strip.
 */
export function buildBoard(
  issues: Issue[],
  dashboard: Dashboard,
  filters: Filters = {},
  viewer: string | null = null,
  starred: ReadonlySet<string> = new Set(),
): Board {
  const byKey = new Map(issues.map((issue) => [issueKey(issue.repo, issue.number), issue]));
  const mine = inScope(dashboard, viewer);
  const repos = new Set(selectedRepos(filters.repo, dashboard.repos));
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
    if (!repos.has(issue.repo)) continue;

    const isEpic =
      issue.kind === "issue" &&
      dashboard.epicLabel !== undefined &&
      issue.labels.some((label) => label.name === dashboard.epicLabel);
    if (isEpic) epicIssues.push(issue);

    if (!wanted(issue)) continue;

    const placed = placeCard(dashboard, issue.kind, matchLabels(issue));
    if (!placed) {
      board.unplaced += 1;
      continue;
    }
    const { lane, column } = placed;
    const blocked = isBlocked(issue, byKey);
    if (lane.hideBlocked && blocked) {
      board.hiddenBlocked[lane.id] = (board.hiddenBlocked[lane.id] ?? 0) + 1;
      continue;
    }
    board.cells[cellKey(lane.id, column.id)]!.push({
      key: issueKey(issue.repo, issue.number),
      kind: issue.kind,
      repo: issue.repo,
      number: issue.number,
      title: issue.title,
      url: issue.url,
      assignees: issue.assignees,
      labels: issue.labels.filter((label) => !structural.has(label.name)),
      progress: issue.subIssues.total > 0 ? issue.subIssues : null,
      blocked,
      isEpic,
      statuses: issue.statuses,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    });
    board.laneTotals[lane.id] = (board.laneTotals[lane.id] ?? 0) + 1;
  }

  const compare = compareBy(sort.by, sort.dir);
  for (const [key, cards] of Object.entries(board.cells))
    board.cells[key] = cards.toSorted(compare);
  const isStarred = (issue: Issue) => starred.has(keyOf(issue));
  board.epics = epicIssues
    .toSorted((a, b) => Number(isStarred(b)) - Number(isStarred(a)) || compare(a, b))
    .map((issue) => ({
      key: keyOf(issue),
      repo: issue.repo,
      number: issue.number,
      title: issue.title,
      url: issue.url,
      progress: issue.subIssues.total > 0 ? issue.subIssues : null,
      starred: isStarred(issue),
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
 * source group's labels the issue carries, add what the target group needs (its first real
 * label, or every one for an "all" group; nothing for a catch-all). A label that the
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
