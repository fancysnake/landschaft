import {
  askedLabels,
  type FilterItem,
  type FilterNode,
  labelKey,
  matchesFilter,
  parseFilter,
} from "../filter";
import {
  type Dashboard,
  type Filters,
  ME,
  OTHER_LOOKS_AT,
  selectedRepos,
  type SortBy,
  type SortDir,
} from "../schema";
import {
  type Board,
  type Card,
  cellKey,
  type Epic,
  type Issue,
  issueKey,
  type IssueRef,
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

/**
 * An issue with what filters test it on: its statuses plus `is:has-pr` when an open PR closes
 * it, whether an open blocker holds it, and whether it blocks an open issue. Every open item in
 * `issues` counts, whoever's it is; one in a repo outside them is never seen.
 */
export function itemsOf(
  issues: Issue[],
  byKey: Map<string, Issue>,
): (issue: Issue) => Omit<Issue, "statuses"> & FilterItem {
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
 * assigned to take part. `starred` epic keys lead the epic strip. `viewer` is what `@me`
 * in a filter stands for.
 */
export function buildBoard(
  issues: Issue[],
  dashboard: Dashboard,
  filters: Filters = {},
  users: string[] = [],
  starred: ReadonlySet<string> = new Set(),
  viewer: string | null = null,
): Board {
  const byKey = new Map(issues.map((issue) => [issueKey(issue.repo, issue.number), issue]));
  const listed = byUsers(dashboard, users);
  const repos = new Set(selectedRepos(filters.repo, dashboard.repos));
  const wanted = issueFilter(filters, byKey);
  const open = issues.filter((issue) => issue.state === "OPEN" && listed(issue));
  // From all of `issues`, not just `open`.
  const itemOf = itemsOf(issues, byKey);
  const axes = { swimlanes: compile(dashboard.swimlanes), columns: compile(dashboard.columns) };
  const epicLabel = dashboard.epicLabel && labelKey(dashboard.epicLabel);
  // By `labelKey`, like every label comparison here.
  const structural = new Set<string>([
    ...[...axes.swimlanes, ...axes.columns].flatMap((group) => askedLabels(group.node)),
    ...(epicLabel ? [epicLabel] : []),
  ]);
  const shown = (label: { name: string }) => !structural.has(labelKey(label.name));
  const sort = { by: filters.sort ?? dashboard.sort.by, dir: filters.dir ?? dashboard.sort.dir };

  const board: Board = {
    cells: {},
    laneTotals: {},
    columnTotals: {},
    hiddenBlocked: {},
    epics: [],
    unplaced: 0,
    total: 0,
    assignees: [],
    labels: [],
    sort,
  };
  for (const lane of dashboard.swimlanes) {
    board.laneTotals[lane.id] = 0;
    board.hiddenBlocked[lane.id] = 0;
    for (const column of dashboard.columns) board.cells[cellKey(lane.id, column.id)] = [];
  }
  for (const column of dashboard.columns) board.columnTotals[column.id] = 0;

  const assignees = new Set<string>();
  /** First spelling seen of each label, by its `labelKey`. */
  const labels = new Map<string, string>();
  const epicIssues: Issue[] = [];

  for (const issue of open) {
    for (const assignee of issue.assignees) assignees.add(assignee.login);
    for (const label of issue.labels.filter(shown)) {
      const key = labelKey(label.name);
      if (!labels.has(key)) labels.set(key, label.name);
    }
    if (!repos.has(issue.repo)) continue;

    const isEpic =
      issue.kind === "issue" &&
      epicLabel !== undefined &&
      issue.labels.some((label) => labelKey(label.name) === epicLabel);
    if (isEpic) epicIssues.push(issue);

    if (!wanted(issue)) continue;

    const item = itemOf(issue);
    const { statuses, blocked } = item;
    const hit = (node: FilterNode, other: boolean) => matchesFilter(node, item, { viewer, other });
    const lanes = placeIn(axes.swimlanes, hit, OTHER_LOOKS_AT.swimlanes);
    const columns = placeIn(axes.columns, hit, OTHER_LOOKS_AT.columns);
    if (lanes.length === 0 || columns.length === 0) {
      board.unplaced += 1;
      continue;
    }
    const card: Card = {
      key: issueKey(issue.repo, issue.number),
      kind: issue.kind,
      repo: issue.repo,
      number: issue.number,
      title: issue.title,
      url: issue.url,
      assignees: issue.assignees,
      labels: issue.labels.filter(shown),
      progress: issue.subIssues.total > 0 ? issue.subIssues : null,
      blocked,
      isEpic,
      statuses,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    };
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
  board.assignees = [...assignees].toSorted();
  board.labels = [...labels.values()].toSorted();
  return board;
}
