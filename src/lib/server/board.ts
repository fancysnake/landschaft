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
  type ViewQuery,
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
  type CiJob,
  type CiJobCard,
  ciJobKey,
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
    authors: issue.author === null ? [] : [issue.author],
    statuses: withPr.has(keyOf(issue)) ? [...issue.statuses, "is:has-pr"] : issue.statuses,
    blocked: isBlocked(issue, byKey),
    blocking: blocking.has(keyOf(issue)),
    name: null,
    branch: null,
  });
}

/** A failed CI job as filters see it: no labels, assignees or links, never blocked. */
const jobItem = (job: CiJob): FilterItem => ({
  kind: "ci-job",
  repo: job.repo,
  authors: job.authors,
  assignees: [],
  labels: [],
  statuses: job.pr ? ["is:has-pr"] : [],
  parent: null,
  subIssues: { total: 0 },
  blocked: false,
  blocking: false,
  name: job.name,
  branch: job.branch,
});

const jobCard = (job: CiJob): CiJobCard => ({
  key: ciJobKey(job),
  kind: "ci-job",
  repo: job.repo,
  branch: job.branch,
  workflow: job.workflow,
  name: job.name,
  url: job.url,
  failedAt: job.failedAt,
  pr: job.pr,
});

/** `jobs` that one of the global `users` (empty for everyone) has commits in and that pass `scope`. */
function scopedJobs(
  jobs: CiJob[],
  users: string[],
  viewer: string | null,
  scope: FilterNode | null = null,
): { job: CiJob; item: FilterItem }[] {
  const passes = inScope(users, viewer, scope);
  return jobs.flatMap((job) => {
    const item = jobItem(job);
    return passes(item) ? [{ job, item }] : [];
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
 * Text, assignee, label, job and epic filters as one predicate over an item, its card `key` and
 * the `text` the search box matches; an unset filter passes everything.
 */
function barFilter(
  filters: Filters,
  byKey: Map<string, Issue>,
): (item: FilterItem, key: string, text: string) => boolean {
  const query = filters.q?.trim().toLowerCase();
  const related = filters.epic ? relatedTo(filters.epic, byKey) : null;
  const wantedLabel = filters.label && labelKey(filters.label);
  const wantedJob = filters.job?.toLowerCase();
  return (item, key, text) =>
    (!query || text.toLowerCase().includes(query)) &&
    (!filters.assignee || item.assignees.some((a) => a.login === filters.assignee)) &&
    (!wantedLabel || item.labels.some((l) => labelKey(l.name) === wantedLabel)) &&
    (!wantedJob || item.name?.toLowerCase() === wantedJob) &&
    (!related || related.has(key));
}

function compareBy(by: SortBy, dir: SortDir) {
  const field = by === "created" ? "createdAt" : "updatedAt";
  const sign = dir === "asc" ? 1 : -1;
  // A CI job sorts by when it failed, by either field.
  const at = (x: Card | Issue) => (x.kind === "ci-job" ? x.failedAt : x[field]);
  return (a: Card | Issue, b: Card | Issue): number => {
    const left = at(a);
    const right = at(b);
    return left < right ? -sign : left > right ? sign : 0;
  };
}

/** Holds for items one of the global `users` (empty for everyone) authored or is assigned to. */
const usersNode = (users: string[]): FilterNode | null =>
  users.length > 0 ? { type: "term", key: "user", values: users } : null;

/** Holds for items one of the global `users` (empty for everyone) is in that pass `scope`. */
function inScope(
  users: string[],
  viewer: string | null,
  scope: FilterNode | null,
): (item: FilterItem) => boolean {
  const base = usersNode(users);
  return (item) => matchesFilter(base, item, { viewer }) && matchesFilter(scope, item, { viewer });
}

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
  const passes = inScope(users, viewer, scope);
  const open = issues.flatMap((issue) => {
    if (issue.state !== "OPEN") return [];
    const item = itemOf(issue);
    return passes(item) ? [{ issue, item }] : [];
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
  const passes = inScope([], viewer, parseFilter(dashboard.filter));
  if (dashboard.type === "inbox") {
    const groups = compile(dashboard.groups);
    return (item) => passes(item) && firstGroup(groups, item, viewer) !== undefined;
  }
  const grid = compileGrid(dashboard);
  return (item) => passes(item) && placeOnGrid(grid, item, viewer) !== null;
}

/**
 * The repo chips, filter options and sort of a view over `open` and `openJobs`, offering the
 * `shown` labels.
 */
function facetsOf(
  open: { issue: Issue }[],
  openJobs: { job: CiJob }[],
  shown: (label: { name: string }) => boolean,
  filters: ViewQuery,
  sort: Dashboard["sort"],
): Facets {
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
    repos: [
      ...new Set([...open.map(({ issue }) => issue.repo), ...openJobs.map(({ job }) => job.repo)]),
    ].toSorted(),
    assignees: [...assignees].toSorted(),
    labels: [...labels.values()].toSorted(),
    jobs: [...new Set(openJobs.map(({ job }) => job.name))].toSorted(),
    sort: { by: filters.sort ?? sort.by, dir: filters.dir ?? sort.dir },
  };
}

/**
 * Whether a card keeps a label: all but the ones `nodes` ask for and the `epicLabel`, compared
 * by `labelKey`.
 */
function labelShown(
  nodes: (FilterNode | null)[],
  epicLabel?: string,
): (label: { name: string }) => boolean {
  const structural = new Set([...nodes.flatMap(askedLabels), ...(epicLabel ? [epicLabel] : [])]);
  return (label) => !structural.has(labelKey(label.name));
}

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
 * Cards for the open items of the global `users` in `issues` that no dashboard places in a
 * cell or group, and of their failed CI `jobs`, outside the `hide` repos and passing `filter`, most
 * recently updated first. One a swimlane hides as blocked counts as placed.
 */
export function unmatchedItems(
  issues: Issue[],
  dashboards: Dashboard[],
  users: string[] = [],
  viewer: string | null = null,
  hide: readonly string[] = [],
  jobs: CiJob[] = [],
  filter: FilterNode | null = null,
): Card[] {
  const placers = dashboards.map((dashboard) => placer(dashboard, viewer));
  const placed = (item: FilterItem) => placers.some((places) => places(item));
  const missed = ({ item }: { item: FilterItem }) =>
    !hide.includes(item.repo) && matchesFilter(filter, item, { viewer }) && !placed(item);
  // Hidden repos are dropped last: their items still count for `is:has-pr` and blockers.
  return [
    ...openItemsOf(issues, users, viewer)
      .open.filter(missed)
      .map(({ item }) => toCard(item, item.labels, false)),
    ...scopedJobs(jobs, users, viewer)
      .filter(missed)
      .map(({ job }) => jobCard(job)),
  ].toSorted(compareBy("updated", "desc"));
}

/**
 * Lays the dashboard's `scopedIssues`, and the failed CI `jobs` that pass the same scope, out on
 * its grid. `starred` epic keys lead the epic strip.
 */
export function buildBoard(
  issues: Issue[],
  dashboard: BoardDashboard,
  filters: ViewQuery = {},
  users: string[] = [],
  starred: ReadonlySet<string> = new Set(),
  viewer: string | null = null,
  jobs: CiJob[] = [],
): Board {
  const axes = compileGrid(dashboard);
  const { scope } = axes;
  const { byKey, open } = openItemsOf(issues, users, viewer, scope);
  const openJobs = scopedJobs(jobs, users, viewer, scope);
  const wanted = barFilter(filters, byKey);
  const epicLabel = dashboard.epicLabel && labelKey(dashboard.epicLabel);
  const shown = labelShown(
    [scope, ...[...axes.swimlanes, ...axes.columns].map((group) => group.node)],
    epicLabel,
  );
  const facets = facetsOf(open, openJobs, shown, filters, dashboard.sort);
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

  /** Puts `card` in every cell `item` lands in, and counts it once if it shows in any. */
  const put = (item: FilterItem, card: Card) => {
    const placed = placeOnGrid(axes, item, viewer);
    if (!placed) return;
    const { lanes, columns } = placed;
    let shownInAny = false;
    for (const lane of lanes) {
      if (lane.hideBlocked && item.blocked) {
        board.hiddenBlocked[lane.id] = (board.hiddenBlocked[lane.id] ?? 0) + 1;
        continue;
      }
      for (const column of columns) board.cells[cellKey(lane.id, column.id)]!.push(card);
      board.laneTotals[lane.id] = (board.laneTotals[lane.id] ?? 0) + 1;
      shownInAny = true;
    }
    if (!shownInAny) return;
    board.total += 1;
    for (const column of columns)
      board.columnTotals[column.id] = (board.columnTotals[column.id] ?? 0) + 1;
  };

  for (const { issue, item } of open) {
    if (filters.hide?.includes(issue.repo)) continue;

    const isEpic =
      issue.kind === "issue" &&
      epicLabel !== undefined &&
      issue.labels.some((label) => labelKey(label.name) === epicLabel);
    if (isEpic) epicIssues.push(issue);

    if (wanted(item, keyOf(issue), `${issue.number} ${issue.title}`))
      put(item, toCard(item, issue.labels.filter(shown), isEpic));
  }
  for (const { job, item } of openJobs) {
    if (
      !filters.hide?.includes(job.repo) &&
      wanted(item, ciJobKey(job), `${job.name} ${job.branch}`)
    )
      put(item, jobCard(job));
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

/**
 * Puts each of the dashboard's `scopedIssues`, and the failed CI `jobs` that pass the same scope,
 * in the first group it matches, in sort order.
 */
export function buildInbox(
  issues: Issue[],
  dashboard: InboxDashboard,
  filters: ViewQuery = {},
  users: string[] = [],
  viewer: string | null = null,
  jobs: CiJob[] = [],
): Inbox {
  const scope = parseFilter(dashboard.filter);
  const groups = compile(dashboard.groups);
  const { byKey, open } = openItemsOf(issues, users, viewer, scope);
  const openJobs = scopedJobs(jobs, users, viewer, scope);
  const wanted = barFilter(filters, byKey);
  const shown = labelShown([scope, ...groups.map((group) => group.node)]);
  const facets = facetsOf(open, openJobs, shown, filters, dashboard.sort);
  const cards = new Map<string, Card[]>(groups.map((group) => [group.id, []]));
  let total = 0;
  const put = (item: FilterItem, card: Card) => {
    const group = firstGroup(groups, item, viewer);
    if (!group) return;
    cards.get(group.id)!.push(card);
    total += 1;
  };
  for (const { issue, item } of open) {
    if (
      !filters.hide?.includes(issue.repo) &&
      wanted(item, keyOf(issue), `${issue.number} ${issue.title}`)
    )
      put(item, toCard(item, issue.labels.filter(shown), false));
  }
  for (const { job, item } of openJobs) {
    if (
      !filters.hide?.includes(job.repo) &&
      wanted(item, ciJobKey(job), `${job.name} ${job.branch}`)
    )
      put(item, jobCard(job));
  }
  const compare = compareBy(facets.sort.by, facets.sort.dir);
  return {
    ...facets,
    groups: Object.fromEntries([...cards].map(([id, list]) => [id, list.toSorted(compare)])),
    total,
  };
}
