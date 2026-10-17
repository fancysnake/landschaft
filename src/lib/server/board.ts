import {
  askedLabels,
  type FilterItem,
  type FilterNode,
  labelKey,
  matchesFilter,
  parseFilter,
} from "../filter";
import {
  type BoardDashboard,
  type BoardQuery,
  type Dashboard,
  type Filters,
  type InboxDashboard,
  OTHER_LOOKS_AT,
  type SortBy,
  type SortDir,
} from "../schema";
import {
  type Board,
  type Card,
  cellKey,
  type Epic,
  type Facets,
  type Inbox,
  type Issue,
  issueKey,
  type IssueRef,
  type LabelRef,
} from "../types";

/** A swimlane or column with its filter parsed; a null `node` matches everything. */
export interface Group {
  id: string;
  node: FilterNode | null;
}

/** `groups` with their filters parsed. */
export const compile = <T extends { id: string; filter: string }>(groups: T[]): (T & Group)[] =>
  groups.map((group) => ({ ...group, node: parseFilter(group.filter) }));

/**
 * Every group whose filter `hit` accepts, in list order. `hit` gets whether `other` holds:
 * no group it looks at (see `OTHER_LOOKS_AT`) matched.
 */
export function placeIn<T extends Group>(
  groups: T[],
  hit: (node: FilterNode, other: boolean) => boolean,
  looksAt: "earlier" | "later" = "earlier",
): T[] {
  let caught = false;
  const accepted = new Set<T>();
  for (const group of looksAt === "earlier" ? groups : groups.toReversed()) {
    if (group.node !== null && !hit(group.node, !caught)) continue;
    accepted.add(group);
    caught = true;
  }
  return groups.filter((group) => accepted.has(group));
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

/** An issue with what filters test it on; see `itemsOf`. */
type Item = Omit<Issue, "statuses"> & FilterItem;

/**
 * An issue with what filters test it on: its statuses plus `is:has-pr` when an open PR closes
 * it, whether an open blocker holds it, and whether it blocks an open issue. Every open item in
 * `issues` counts, whoever's it is; one in a repo outside them is never seen.
 */
export function itemsOf(issues: Issue[], byKey: Map<string, Issue>): (issue: Issue) => Item {
  const opened = issues.filter((issue) => issue.state === "OPEN");
  const withPr = new Set(opened.flatMap((pr) => pr.linked.map(keyOf)));
  const blocking = new Set(opened.flatMap((issue) => issue.blockedBy.map(keyOf)));
  return (issue) => ({
    ...issue,
    statuses: withPr.has(keyOf(issue)) ? [...issue.statuses, "is:has-pr"] : issue.statuses,
    blocked: isBlocked(issue, byKey),
    blocking: blocking.has(keyOf(issue)),
  });
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
  const wantedLabel = filters.label && labelKey(filters.label);
  return (issue) =>
    (!query || `${issue.number} ${issue.title}`.toLowerCase().includes(query)) &&
    (!filters.assignee || issue.assignees.some((a) => a.login === filters.assignee)) &&
    (!wantedLabel || issue.labels.some((l) => labelKey(l.name) === wantedLabel)) &&
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

/** Holds for items one of the global `users` (empty for everyone) authored or is assigned to. */
const usersNode = (users: string[]): FilterNode | null =>
  users.length > 0 ? { type: "term", key: "user", values: users } : null;

/**
 * `issues` by key, and the open ones that one of the global `users` (empty for everyone)
 * authored or is assigned to and that pass `scope`, each with its item.
 */
function openItemsOf(
  issues: Issue[],
  users: string[],
  viewer: string | null,
  scope: FilterNode | null = null,
): { byKey: Map<string, Issue>; open: { issue: Issue; item: Item }[] } {
  const byKey = new Map(issues.map((issue) => [keyOf(issue), issue]));
  // From all of `issues`, not just the open ones.
  const itemOf = itemsOf(issues, byKey);
  const base = usersNode(users);
  const open = issues.flatMap((issue) => {
    if (issue.state !== "OPEN") return [];
    const item = itemOf(issue);
    const passes = matchesFilter(base, item, { viewer }) && matchesFilter(scope, item, { viewer });
    return passes ? [{ issue, item }] : [];
  });
  return { byKey, open };
}

/** The dashboard's filter, swimlanes and columns, parsed. */
function compileGrid(dashboard: BoardDashboard) {
  return {
    scope: parseFilter(dashboard.filter),
    swimlanes: compile(dashboard.swimlanes),
    columns: compile(dashboard.columns),
  };
}

/** The swimlanes and columns `item` lands in, or null when it misses either. */
function placeOnGrid<L extends Group, C extends Group>(
  axes: { swimlanes: L[]; columns: C[] },
  item: FilterItem,
  viewer: string | null,
): { lanes: L[]; columns: C[] } | null {
  const hit = (node: FilterNode, other: boolean) => matchesFilter(node, item, { viewer, other });
  const lanes = placeIn(axes.swimlanes, hit, OTHER_LOOKS_AT.swimlanes);
  const columns = placeIn(axes.columns, hit, OTHER_LOOKS_AT.columns);
  return lanes.length > 0 && columns.length > 0 ? { lanes, columns } : null;
}

/** The first inbox group `item` matches; `other` holds in each, as no earlier one took it. */
function firstGroup<G extends Group>(
  groups: G[],
  item: FilterItem,
  viewer: string | null,
): G | undefined {
  return groups.find((group) => matchesFilter(group.node, item, { viewer, other: true }));
}

/** Whether the dashboard shows `item` in a cell or group, blocked-hiding aside. */
function placer(dashboard: Dashboard, viewer: string | null): (item: FilterItem) => boolean {
  const scope = parseFilter(dashboard.filter);
  const inScope = (item: FilterItem) => matchesFilter(scope, item, { viewer });
  if (dashboard.type === "inbox") {
    const groups = compile(dashboard.groups);
    return (item) => inScope(item) && firstGroup(groups, item, viewer) !== undefined;
  }
  const grid = compileGrid(dashboard);
  return (item) => inScope(item) && placeOnGrid(grid, item, viewer) !== null;
}

/**
 * The repo chips, filter options and sort of a view over `open`; the repos it shows; and which
 * labels its cards keep: all but the `structural` ones, compared by `labelKey`.
 */
function facetsOf(
  open: { issue: Issue }[],
  structural: Set<string>,
  filters: BoardQuery,
  sort: Dashboard["sort"],
): { facets: Facets; shownRepos: Set<string>; shown: (label: { name: string }) => boolean } {
  const present = [...new Set(open.map(({ issue }) => issue.repo))].toSorted();
  const shown = (label: { name: string }) => !structural.has(labelKey(label.name));
  const assignees = new Set<string>();
  /** First spelling seen of each label, by its `labelKey`. */
  const labels = new Map<string, string>();
  for (const { issue } of open) {
    for (const assignee of issue.assignees) assignees.add(assignee.login);
    for (const label of issue.labels.filter(shown)) {
      const key = labelKey(label.name);
      if (!labels.has(key)) labels.set(key, label.name);
    }
  }
  return {
    facets: {
      repos: present,
      assignees: [...assignees].toSorted(),
      labels: [...labels.values()].toSorted(),
      sort: { by: filters.sort ?? sort.by, dir: filters.dir ?? sort.dir },
    },
    shownRepos: new Set(present.filter((repo) => !filters.hide?.includes(repo))),
    shown,
  };
}

/** The labels `nodes` ask for, by `labelKey`. */
const structuralOf = (nodes: (FilterNode | null)[]) => new Set(nodes.flatMap(askedLabels));

/** `item` as a card showing `labels`. */
const toCard = (item: Item, labels: LabelRef[], isEpic: boolean): Card => ({
  key: keyOf(item),
  kind: item.kind,
  repo: item.repo,
  number: item.number,
  title: item.title,
  url: item.url,
  assignees: item.assignees,
  labels,
  progress: item.subIssues.total > 0 ? item.subIssues : null,
  blocked: item.blocked,
  isEpic,
  statuses: item.statuses,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

/**
 * The open items of the global repos' `issues` that one of the global `users` (empty for
 * everyone) authored or is assigned to and that pass the dashboard's filter. `viewer` is what
 * `@me` stands for.
 */
export function scopedIssues(
  issues: Issue[],
  dashboard: Pick<Dashboard, "filter">,
  users: string[] = [],
  viewer: string | null = null,
): Issue[] {
  const { open } = openItemsOf(issues, users, viewer, parseFilter(dashboard.filter));
  return open.map(({ issue }) => issue);
}

/**
 * Cards for the open items of the global `users` in `issues` that no dashboard places in a cell
 * or group, outside the `hide` repos, most recently updated first. One a swimlane hides as blocked
 * counts as placed.
 */
export function unmatchedIssues(
  issues: Issue[],
  dashboards: Dashboard[],
  users: string[] = [],
  viewer: string | null = null,
  hide: readonly string[] = [],
): Card[] {
  const placers = dashboards.map((dashboard) => placer(dashboard, viewer));
  const placed = (item: Item) => placers.some((places) => places(item));
  // Hidden repos are dropped last: their items still count for `is:has-pr` and blockers.
  return openItemsOf(issues, users, viewer)
    .open.filter(({ issue, item }) => !hide.includes(issue.repo) && !placed(item))
    .map(({ item }) => toCard(item, item.labels, false))
    .toSorted(compareBy("updated", "desc"));
}

/**
 * Lays the dashboard's `scopedIssues` out on its grid. `starred` epic keys lead the epic strip.
 */
export function buildBoard(
  issues: Issue[],
  dashboard: BoardDashboard,
  filters: BoardQuery = {},
  users: string[] = [],
  starred: ReadonlySet<string> = new Set(),
  viewer: string | null = null,
): Board {
  const axes = compileGrid(dashboard);
  const { scope } = axes;
  const { byKey, open } = openItemsOf(issues, users, viewer, scope);
  const wanted = issueFilter(filters, byKey);
  const epicLabel = dashboard.epicLabel && labelKey(dashboard.epicLabel);
  const structural = structuralOf([
    scope,
    ...[...axes.swimlanes, ...axes.columns].map((group) => group.node),
  ]);
  if (epicLabel) structural.add(epicLabel);
  const { facets, shownRepos: repos, shown } = facetsOf(open, structural, filters, dashboard.sort);
  const { sort } = facets;

  const board: Board = {
    ...facets,
    cells: {},
    laneTotals: {},
    columnTotals: {},
    hiddenBlocked: {},
    epics: [],
    total: 0,
  };
  for (const lane of dashboard.swimlanes) {
    board.laneTotals[lane.id] = 0;
    board.hiddenBlocked[lane.id] = 0;
    for (const column of dashboard.columns) board.cells[cellKey(lane.id, column.id)] = [];
  }
  for (const column of dashboard.columns) board.columnTotals[column.id] = 0;

  const epicIssues: Issue[] = [];

  for (const { issue, item } of open) {
    if (!repos.has(issue.repo)) continue;

    const isEpic =
      issue.kind === "issue" &&
      epicLabel !== undefined &&
      issue.labels.some((label) => labelKey(label.name) === epicLabel);
    if (isEpic) epicIssues.push(issue);

    if (!wanted(issue)) continue;

    const placed = placeOnGrid(axes, item, viewer);
    if (!placed) continue;
    const { lanes, columns } = placed;
    const { blocked } = item;
    const card = toCard(item, issue.labels.filter(shown), isEpic);
    let shownInAny = false;
    for (const lane of lanes) {
      if (lane.hideBlocked && blocked) {
        board.hiddenBlocked[lane.id] = (board.hiddenBlocked[lane.id] ?? 0) + 1;
        continue;
      }
      for (const column of columns) board.cells[cellKey(lane.id, column.id)]!.push(card);
      board.laneTotals[lane.id] = (board.laneTotals[lane.id] ?? 0) + 1;
      shownInAny = true;
    }
    if (!shownInAny) continue;
    board.total += 1;
    for (const column of columns)
      board.columnTotals[column.id] = (board.columnTotals[column.id] ?? 0) + 1;
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
  return board;
}

/** Puts each of the dashboard's `scopedIssues` in the first group it matches, in sort order. */
export function buildInbox(
  issues: Issue[],
  dashboard: InboxDashboard,
  filters: BoardQuery = {},
  users: string[] = [],
  viewer: string | null = null,
): Inbox {
  const scope = parseFilter(dashboard.filter);
  const groups = compile(dashboard.groups);
  const { byKey, open } = openItemsOf(issues, users, viewer, scope);
  const wanted = issueFilter(filters, byKey);
  const structural = structuralOf([scope, ...groups.map((group) => group.node)]);
  const { facets, shownRepos, shown } = facetsOf(open, structural, filters, dashboard.sort);
  const cards = new Map<string, Card[]>(groups.map((group) => [group.id, []]));
  let total = 0;
  for (const { issue, item } of open) {
    if (!shownRepos.has(issue.repo) || !wanted(issue)) continue;
    const group = firstGroup(groups, item, viewer);
    if (!group) continue;
    cards.get(group.id)!.push(toCard(item, issue.labels.filter(shown), false));
    total += 1;
  }
  const compare = compareBy(facets.sort.by, facets.sort.dir);
  return {
    ...facets,
    groups: Object.fromEntries([...cards].map(([id, list]) => [id, list.toSorted(compare)])),
    total,
  };
}
