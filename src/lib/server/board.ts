import {
  AXIS_PRECEDENCE,
  type Column,
  type Dashboard,
  type Filters,
  fitsKind,
  isCatchAll,
  isStatusLabel,
  ME,
  type KindFilter,
  type Match,
  type Precedence,
  selectedRepos,
  type SortBy,
  type StatusLabel,
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
 * The item's label names plus the status labels that hold for it; a real GitHub label
 * named like a status does not count as one.
 */
export function matchLabels(
  issue: Pick<Issue, "labels"> & { statuses: StatusLabel[] },
): Set<string> {
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
 * The statuses of an item among `issues`: a PR's own, plus `is:has-pr` for an item an open
 * PR closes. Only PRs among `issues` count, so one in a repo outside them is never seen.
 */
export function statusesOf(issues: Issue[]): (issue: Issue) => StatusLabel[] {
  const withPr = new Set(
    issues.filter((issue) => issue.state === "OPEN").flatMap((pr) => pr.linked.map(keyOf)),
  );
  return (issue) => (withPr.has(keyOf(issue)) ? [...issue.statuses, "is:has-pr"] : issue.statuses);
}

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

/**
 * The dashboard's users as plain logins: `@me` becomes `viewer`, or drops out while that is
 * unknown, and a `[bot]` suffix comes off, since synced bot logins lack it.
 */
export function resolveUsers(users: string[], viewer: string | null): string[] {
  return users.flatMap((user) => {
    const login = user.toLowerCase() === ME ? viewer : user.replace(/\[bot\]$/i, "");
    return login === null ? [] : [login];
  });
}

function byUsers(dashboard: Dashboard, users: string[]): (issue: Issue) => boolean {
  if (dashboard.users.length === 0) return () => true;
  const logins = new Set(users.map((user) => user.toLowerCase()));
  const listed = (login: string | null) => login !== null && logins.has(login.toLowerCase());
  return (issue) => listed(issue.author) || issue.assignees.some(({ login }) => listed(login));
}

/**
 * Lays the open issues out on the dashboard's grid. `users` is the dashboard's users through
 * `resolveUsers`; when the dashboard lists any, only issues one of them authored or is
 * assigned to take part. `starred` epic keys lead the epic strip.
 */
export function buildBoard(
  issues: Issue[],
  dashboard: Dashboard,
  filters: Filters = {},
  users: string[] = [],
  starred: ReadonlySet<string> = new Set(),
): Board {
  const byKey = new Map(issues.map((issue) => [issueKey(issue.repo, issue.number), issue]));
  const listed = byUsers(dashboard, users);
  const repos = new Set(selectedRepos(filters.repo, dashboard.repos));
  const wanted = issueFilter(filters, byKey);
  const open = issues.filter((issue) => issue.state === "OPEN" && listed(issue));
  // Any open PR in `issues` counts, whoever's it is, so not just `open`.
  const statusesFor = statusesOf(issues);
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

    const statuses = statusesFor(issue);
    const placed = placeCard(dashboard, issue.kind, matchLabels({ ...issue, statuses }));
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
      statuses,
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
