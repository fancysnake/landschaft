import {
  askedLabels,
  type FilterItem,
  type FilterNode,
  labelKey,
  matchesFilter,
  type Offer,
  parseFilter,
} from "../filter";
import {
  type BoardDashboard,
  type ViewQuery,
  type Dashboard,
  closedSince,
  type Filters,
  type InboxDashboard,
  OTHER_LOOKS_AT,
  type SortBy,
  type SortDir,
  type UnmatchedQuery,
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
  type Snapshot,
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
type Item = Issue & FilterItem;

/**
 * An issue with what filters test it on: whether an open PR closes it, whether an open blocker
 * holds it, and whether it blocks an open issue. A closed item is none of these, and has no
 * statuses since only open PRs' refresh. Every open item in `issues` counts, whoever's it is;
 * one in a repo outside them is never seen.
 */
export function itemsOf(issues: Issue[], byKey: Map<string, Issue>): (issue: Issue) => Item {
  const opened = issues.filter((issue) => issue.state === "OPEN");
  const withPr = new Set(opened.flatMap((pr) => pr.linked.map(keyOf)));
  const blocking = new Set(opened.flatMap((issue) => issue.blockedBy.map(keyOf)));
  return (issue) => ({
    ...issue,
    authors: issue.author === null ? [] : [issue.author],
    hasPr: issue.state === "OPEN" && withPr.has(keyOf(issue)),
    statuses: issue.state === "OPEN" ? issue.statuses : [],
    blocked: issue.state === "OPEN" && isBlocked(issue, byKey),
    blocking: issue.state === "OPEN" && blocking.has(keyOf(issue)),
    name: null,
    branch: null,
  });
}

/** An item as the filter bar and its options see it; a CI job has no issue type. */
type BarItem = FilterItem & { issueType?: string | null };

/** A failed CI job as filters see it, its labels carrying the colours its card shows. */
type JobItem = Omit<FilterItem, "labels"> & { labels: LabelRef[] };

/**
 * A failed CI job as filters see it: the labels of its open PR in `byKey`, no assignees or links,
 * never blocked.
 */
const jobItem = (job: CiJob, byKey: Map<string, Issue>): JobItem => ({
  kind: "ci-job",
  state: "OPEN",
  repo: job.repo,
  authors: job.authors,
  assignees: [],
  labels:
    [job.pr && byKey.get(issueKey(job.repo, job.pr.number))].find((pr) => pr?.state === "OPEN")
      ?.labels ?? [],
  statuses: [],
  hasPr: job.pr !== null,
  parent: null,
  subIssues: { total: 0 },
  blocked: false,
  blocking: false,
  name: job.name,
  branch: job.branch,
});

/** `job` as a card showing `labels`. */
const jobCard = (job: CiJob, labels: LabelRef[]): CiJobCard => ({
  key: ciJobKey(job),
  kind: "ci-job",
  repo: job.repo,
  branch: job.branch,
  workflow: job.workflow,
  name: job.name,
  url: job.url,
  failedAt: job.failedAt,
  pr: job.pr,
  labels,
});

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
 * Text, assignee, label, type, job and epic filters as one predicate over an item, its card `key`
 * and the `text` the search box matches; an unset filter passes everything.
 */
function barFilter(
  filters: Filters,
  byKey: Map<string, Issue>,
): (item: BarItem, key: string, text: string) => boolean {
  const query = filters.q?.trim().toLowerCase();
  const related = filters.epic ? relatedTo(filters.epic, byKey) : null;
  const wantedLabel = filters.label && labelKey(filters.label);
  const wantedType = filters.type?.toLowerCase();
  const wantedJob = filters.job?.toLowerCase();
  return (item, key, text) =>
    (!query || text.toLowerCase().includes(query)) &&
    (!filters.assignee || item.assignees.some((a) => a.login === filters.assignee)) &&
    (!wantedLabel || item.labels.some((l) => labelKey(l.name) === wantedLabel)) &&
    (!wantedType || item.issueType?.toLowerCase() === wantedType) &&
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
 * `issues` by key, plus the open ones, those closed at or after `cutoff` (ms), and the failed
 * CI `jobs` that one of the global `users` (empty for everyone) is in and that pass `scope`,
 * each with its item.
 */
function scopedItems(
  issues: Issue[],
  jobs: CiJob[],
  users: string[],
  viewer: string | null,
  scope: FilterNode | null = null,
  cutoff = Number.POSITIVE_INFINITY,
): {
  byKey: Map<string, Issue>;
  listed: { issue: Issue; item: Item }[];
  jobItems: { job: CiJob; item: JobItem }[];
} {
  const byKey = new Map(issues.map((issue) => [keyOf(issue), issue]));
  // From all of `issues`, not just the open ones.
  const itemOf = itemsOf(issues, byKey);
  const passes = inScope(users, viewer, scope);
  const shows = (issue: Issue) =>
    issue.state === "OPEN" || (issue.closedAt !== null && Date.parse(issue.closedAt) >= cutoff);
  const listed = issues.flatMap((issue) => {
    if (!shows(issue)) return [];
    const item = itemOf(issue);
    return passes(item) ? [{ issue, item }] : [];
  });
  const jobItems = jobs.flatMap((job) => {
    const item = jobItem(job, byKey);
    return passes(item) ? [{ job, item }] : [];
  });
  return { byKey, listed, jobItems };
}

/** The dashboard's filter, swimlanes, columns and `epicLabel` (as a `labelKey`), parsed. */
function compileGrid(dashboard: BoardDashboard) {
  const epicLabel = dashboard.epicLabel && labelKey(dashboard.epicLabel);
  return {
    scope: parseFilter(dashboard.filter),
    swimlanes: compile(dashboard.swimlanes),
    columns: compile(dashboard.columns),
    epicLabel,
    /** An issue with the board's `epicLabel`. */
    isEpic: (item: FilterItem): boolean =>
      item.kind === "issue" &&
      epicLabel !== undefined &&
      item.labels.some((label) => labelKey(label.name) === epicLabel),
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

/** Whether the dashboard shows `item` in a cell, group or epic strip, blocked-hiding aside. */
function placer(dashboard: Dashboard, viewer: string | null): (item: FilterItem) => boolean {
  const passes = inScope([], viewer, parseFilter(dashboard.filter));
  if (dashboard.type === "inbox") {
    const groups = compile(dashboard.groups);
    return (item) => passes(item) && firstGroup(groups, item, viewer) !== undefined;
  }
  const grid = compileGrid(dashboard);
  return (item) => passes(item) && (grid.isEpic(item) || placeOnGrid(grid, item, viewer) !== null);
}

/** The repo chips, filter options and sort of a view over `items`, offering the `shown` labels. */
function facetsOf(
  items: BarItem[],
  shown: (label: { name: string }) => boolean,
  filters: ViewQuery,
  sort: Dashboard["sort"],
): Facets {
  const repos = new Set<string>();
  const assignees = new Set<string>();
  /** First spelling seen of each label, by its `labelKey`. */
  const labels = new Map<string, string>();
  const types = new Set<string>();
  const jobs = new Set<string>();
  for (const item of items) {
    repos.add(item.repo);
    for (const assignee of item.assignees) assignees.add(assignee.login);
    for (const label of item.labels.filter(shown)) {
      const key = labelKey(label.name);
      if (!labels.has(key)) labels.set(key, label.name);
    }
    if (item.issueType) types.add(item.issueType);
    if (item.kind === "ci-job" && item.name !== null) jobs.add(item.name);
  }
  return {
    repos: [...repos].toSorted(),
    assignees: [...assignees].toSorted(),
    labels: [...labels.values()].toSorted(),
    types: [...types].toSorted(),
    jobs: [...jobs].toSorted(),
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
  state: item.state,
  issueType: item.issueType,
  assignees: item.assignees,
  labels,
  progress: item.subIssues.total > 0 ? item.subIssues : null,
  blocked: item.blocked,
  isEpic,
  statuses: item.statuses,
  hasPr: item.hasPr,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

/** Who a view is for: the global `users` (empty for everyone) and the login `@me` stands for. */
export interface Audience {
  users: string[];
  viewer: string | null;
}

/**
 * The repos of the open `issues` and failed CI `jobs` that one of the global `users` is in and
 * that pass the dashboard's filter.
 */
export function scopedRepos(
  { issues, jobs }: Snapshot,
  dashboard: Pick<Dashboard, "filter">,
  { users, viewer }: Audience,
): Set<string> {
  const scope = parseFilter(dashboard.filter);
  const { listed, jobItems } = scopedItems(issues, jobs, users, viewer, scope);
  return new Set([
    ...listed.map(({ issue }) => issue.repo),
    ...jobItems.map(({ job }) => job.repo),
  ]);
}

/** The inputs of the unmatched view. */
interface UnmatchedOptions extends Audience {
  query?: UnmatchedQuery;
}

/**
 * Cards for the open items of the global `users` in `issues` that no dashboard places in a
 * cell or group, and of their failed CI `jobs`, outside the query's `hide` repos and passing its
 * `filter`, most recently updated first. One a swimlane hides as blocked counts as placed.
 * `offer` completes the filter from all those items, whether they pass `filter` or not.
 */
export function unmatchedItems(
  { issues, jobs }: Snapshot,
  dashboards: Dashboard[],
  { users, viewer, query = {} }: UnmatchedOptions,
): { items: Card[]; offer: Offer } {
  const { hide = [] } = query;
  const filter = parseFilter(query.filter ?? "");
  const placers = dashboards.map((dashboard) => placer(dashboard, viewer));
  const placed = (item: FilterItem) => placers.some((places) => places(item));
  const missed = ({ item }: { item: FilterItem }) => !hide.includes(item.repo) && !placed(item);
  // Hidden repos are dropped last: their items still count for `has:pr` and blockers.
  const unmatched = (scope: FilterNode | null) => {
    const { listed, jobItems } = scopedItems(issues, jobs, users, viewer, scope);
    return { listed: listed.filter(missed), jobItems: jobItems.filter(missed) };
  };
  const shown = unmatched(filter);
  const all = filter ? unmatched(null) : shown;
  const sort = { by: "updated", dir: "desc" } as const;
  const { repos, assignees, labels } = facetsOf(
    [...all.listed, ...all.jobItems].map(({ item }) => item),
    () => true,
    {},
    sort,
  );
  return {
    items: [
      ...shown.listed.map(({ item }) => toCard(item, item.labels, false)),
      ...shown.jobItems.map(({ job, item }) => jobCard(job, item.labels)),
    ].toSorted(compareBy(sort.by, sort.dir)),
    offer: { labels, repos, users: assignees },
  };
}

/** The inputs of a board or inbox; `now` dates the window of recently closed items. */
interface ViewOptions extends Audience {
  query?: ViewQuery;
  now?: Date;
}

/** The inputs of a board; `starred` epic keys lead the epic strip. */
interface BoardOptions extends ViewOptions {
  starred?: ReadonlySet<string>;
}

/**
 * Lays the dashboard's `scopedIssues`, and the failed CI `jobs` that pass the same scope, out on
 * its grid.
 */
export function buildBoard(
  { issues, jobs }: Snapshot,
  dashboard: BoardDashboard,
  { query = {}, users, viewer, starred = new Set(), now = new Date() }: BoardOptions,
): Board {
  const axes = compileGrid(dashboard);
  const { scope } = axes;
  const { byKey, listed, jobItems } = scopedItems(
    issues,
    jobs,
    users,
    viewer,
    scope,
    closedSince(dashboard.closedDays, now),
  );
  const wanted = barFilter(query, byKey);
  const shown = labelShown(
    [scope, ...[...axes.swimlanes, ...axes.columns].map((group) => group.node)],
    axes.epicLabel,
  );
  const facets = facetsOf(
    [...listed, ...jobItems].map(({ item }) => item),
    shown,
    query,
    dashboard.sort,
  );
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

  for (const { issue, item } of listed) {
    if (query.hide?.includes(issue.repo)) continue;

    const isEpic = axes.isEpic(item);
    if (isEpic) epicIssues.push(issue);

    if (wanted(item, keyOf(issue), `${issue.number} ${issue.title}`))
      put(item, toCard(item, issue.labels.filter(shown), isEpic));
  }
  for (const { job, item } of jobItems) {
    if (!query.hide?.includes(job.repo) && wanted(item, ciJobKey(job), `${job.name} ${job.branch}`))
      put(item, jobCard(job, item.labels.filter(shown)));
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
  { issues, jobs }: Snapshot,
  dashboard: InboxDashboard,
  { query = {}, users, viewer, now = new Date() }: ViewOptions,
): Inbox {
  const scope = parseFilter(dashboard.filter);
  const groups = compile(dashboard.groups);
  const { byKey, listed, jobItems } = scopedItems(
    issues,
    jobs,
    users,
    viewer,
    scope,
    closedSince(dashboard.closedDays, now),
  );
  const wanted = barFilter(query, byKey);
  const shown = labelShown([scope, ...groups.map((group) => group.node)]);
  const facets = facetsOf(
    [...listed, ...jobItems].map(({ item }) => item),
    shown,
    query,
    dashboard.sort,
  );
  const cards = new Map<string, Card[]>(groups.map((group) => [group.id, []]));
  let total = 0;
  const put = (item: FilterItem, card: Card) => {
    const group = firstGroup(groups, item, viewer);
    if (!group) return;
    cards.get(group.id)!.push(card);
    total += 1;
  };
  for (const { issue, item } of listed) {
    if (
      !query.hide?.includes(issue.repo) &&
      wanted(item, keyOf(issue), `${issue.number} ${issue.title}`)
    )
      put(item, toCard(item, issue.labels.filter(shown), false));
  }
  for (const { job, item } of jobItems) {
    if (!query.hide?.includes(job.repo) && wanted(item, ciJobKey(job), `${job.name} ${job.branch}`))
      put(item, jobCard(job, item.labels.filter(shown)));
  }
  const compare = compareBy(facets.sort.by, facets.sort.dir);
  return {
    ...facets,
    groups: Object.fromEntries([...cards].map(([id, list]) => [id, list.toSorted(compare)])),
    total,
  };
}
