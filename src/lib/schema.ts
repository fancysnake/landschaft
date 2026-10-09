import { z } from "zod";

import { filterError, ISSUE_REF, LOGIN, parseFilter, quoteValue, REPO, usesOther } from "./filter";
import { isStatusLabel } from "./status";

const id = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9_-]+$/i, "letters, digits, - and _ only");
export const repoName = z.string().regex(REPO, "expected owner/repo");
const issueRef = z.string().regex(ISSUE_REF, "expected owner/repo#number");

/** A filter expression (see `filter.ts`); empty matches everything. */
const filterText = z.string().superRefine((text, ctx) => {
  const message = filterError(text);
  if (message) ctx.addIssue({ code: "custom", message });
});

/** Pre-filter fields: a label list, matched by any or all of them, and an item kind. */
const LegacyGroupSchema = z.object({
  labels: z.array(z.string().min(1)).optional(),
  match: z.enum(["any", "all"]).optional(),
  kind: z.enum(["any", "issue", "pr"]).optional(),
});
type LegacyGroup = z.infer<typeof LegacyGroupSchema>;

/**
 * The filter a legacy group stands for: any → `label:a|b`, all → `label:a label:b`; null for
 * the catch-all, which `migrateAxis` rewrites.
 */
function legacyFilter({ labels = [], match = "any", kind = "any" }: LegacyGroup): string | null {
  const plain = labels.filter((name) => !isStatusLabel(name)).map(quoteValue);
  const statuses = labels.filter(isStatusLabel);
  const parts =
    match === "all"
      ? [...plain.map((name) => `label:${name}`), ...statuses]
      : [...(plain.length > 0 ? [`label:${plain.join("|")}`] : []), ...statuses];
  const body = parts.join(match === "all" ? " " : " OR ");
  if (kind === "any") return body || null;
  const ored = match === "any" && parts.length > 1;
  return [`is:${kind}`, ored ? `(${body})` : body].filter(Boolean).join(" ");
}

export type Axis = "swimlanes" | "columns";

/**
 * Which way `other` looks on each axis: up the swimlanes, so the bottom one is the catch-all,
 * and rightward across the columns, so the leftmost one is.
 */
export const OTHER_LOOKS_AT: Record<Axis, "earlier" | "later"> = {
  swimlanes: "earlier",
  columns: "later",
};

/**
 * Old configs carry `labels`/`match`/`kind`; they turn into `filter` unless one is set. A legacy
 * catch-all took what no other entry took: `other` excludes the entries it looks at, a `-(…)`
 * each of the rest.
 */
const migrateAxis =
  (axis: Axis) =>
  <T extends LegacyGroup & { filter?: string }>(groups: T[]) => {
    const filterOf = ({ labels, match, kind, filter }: T) =>
      filter ?? legacyFilter({ labels, match, kind });
    return groups.map(({ labels, match, kind, filter, ...group }, index) => {
      const own = filter ?? legacyFilter({ labels, match, kind });
      if (own !== null) return { ...group, filter: own };
      const unseen =
        OTHER_LOOKS_AT[axis] === "earlier" ? groups.slice(index + 1) : groups.slice(0, index);
      const excluded = unseen.map(filterOf).flatMap((other) => (other ? [`-(${other})`] : []));
      return { ...group, filter: ["other", ...excluded].join(" ") };
    });
  };

export const SwimlaneSchema = z.object({
  id,
  name: z.string().min(1),
  filter: filterText.optional(),
  ...LegacyGroupSchema.shape,
  hideBlocked: z.boolean().default(false),
});

export const ColumnSchema = z.object({
  id,
  name: z.string().min(1),
  filter: filterText.optional(),
  ...LegacyGroupSchema.shape,
});

export const SortBySchema = z.enum(["created", "updated"]);
export const SortDirSchema = z.enum(["asc", "desc"]);

export const SortSchema = z.object({
  by: SortBySchema.default("updated"),
  dir: SortDirSchema.default("desc"),
});

function hasUniqueIds(items: { id: string }[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

/** Stands for the token's account in `users` and in filters. */
export const ME = "@me";

/** A GitHub login, or `@me`. */
export const userName = z.string().regex(LOGIN, "expected a GitHub login or @me");

const refreshMinutes = z.number().int().min(1).max(1440);

/**
 * What is wrong with a dashboard filter, or null: like a swimlane's, minus `other`, since a
 * dashboard has nothing before or after it.
 */
export function dashboardFilterError(text: string): string | null {
  const message = filterError(text);
  if (message) return message;
  return usesOther(parseFilter(text)) ? "`other` only works in swimlanes and columns" : null;
}

const dashboardFilter = z.string().superRefine((text, ctx) => {
  const message = dashboardFilterError(text);
  if (message) ctx.addIssue({ code: "custom", message });
});

export const DashboardSchema = z
  .object({
    id,
    name: z.string().min(1),
    /** Narrows the global base set; empty takes all of it. */
    filter: dashboardFilter.default(""),
    epicLabel: z.string().min(1).optional(),
    sort: SortSchema.default({ by: "updated", dir: "desc" }),
    swimlanes: z.array(SwimlaneSchema).min(1).transform(migrateAxis("swimlanes")),
    columns: z.array(ColumnSchema).min(1).transform(migrateAxis("columns")),
    /** Legacy, folded into the global scope by `migrateScope`. */
    repos: z.array(repoName).optional(),
    users: z.array(userName).optional(),
    /** Legacy: "mine" reads as `users: ["@me"]`, "all" as `users: []`. */
    scope: z.enum(["mine", "all"]).optional(),
    refreshMinutes: refreshMinutes.optional(),
  })
  .superRefine((dashboard, ctx) => {
    for (const axis of ["swimlanes", "columns"] as const) {
      if (!hasUniqueIds(dashboard[axis])) {
        ctx.addIssue({ code: "custom", path: [axis], message: "ids must be unique" });
      }
    }
  });
type LegacyDashboard = z.infer<typeof DashboardSchema>;

const ConfigShape = z.object({
  /** Every board starts from the open items in these repos… */
  repos: z.array(repoName).optional(),
  /** …that these users authored or are assigned to; empty takes everyone's. */
  users: z.array(userName).optional(),
  refreshMinutes: refreshMinutes.optional(),
  dashboards: z.array(DashboardSchema).default([]),
});

const union = (lists: string[][]) => [...new Set(lists.flat())];
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value) => b.includes(value));
const legacyUsers = (dashboard: LegacyDashboard) =>
  dashboard.users ?? (dashboard.scope === "all" ? [] : [ME]);

/**
 * Fills in the global scope. A config without global `repos` predates it: its repos and users
 * are the unions of the dashboards' (users empty when any dashboard took everyone's), its
 * refresh interval the shortest any had, and a dashboard narrower than the union gets a
 * `repo:`/`user:` filter.
 */
function migrateScope(config: z.infer<typeof ConfigShape>) {
  const { repos, users, dashboards } = config;
  const legacy = repos === undefined;
  const intervals = legacy ? dashboards.map((dashboard) => dashboard.refreshMinutes ?? 5) : [];
  const global = {
    repos: repos ?? union(dashboards.map((dashboard) => dashboard.repos ?? [])),
    users:
      users ??
      (legacy && dashboards.every((dashboard) => legacyUsers(dashboard).length > 0)
        ? union(dashboards.map(legacyUsers))
        : []),
    refreshMinutes: config.refreshMinutes ?? (intervals.length > 0 ? Math.min(...intervals) : 5),
  };
  const narrowing = (dashboard: LegacyDashboard) => {
    if (!legacy) return [];
    const own = { repos: dashboard.repos ?? [], users: legacyUsers(dashboard) };
    return (["repos", "users"] as const).flatMap((key) =>
      own[key].length === 0 || sameSet(own[key], global[key])
        ? []
        : [`${key.slice(0, -1)}:${own[key].join("|")}`],
    );
  };
  return {
    ...global,
    dashboards: dashboards.map((dashboard) => {
      const { name, filter, epicLabel, sort, swimlanes, columns } = dashboard;
      const parts = narrowing(dashboard);
      const own = filter && parts.length > 0 ? `(${filter})` : filter;
      const narrowed = [own, ...parts].filter(Boolean).join(" ");
      return { id: dashboard.id, name, filter: narrowed, epicLabel, sort, swimlanes, columns };
    }),
  };
}

export const ConfigSchema = ConfigShape.superRefine((config, ctx) => {
  if (!hasUniqueIds(config.dashboards)) {
    ctx.addIssue({ code: "custom", path: ["dashboards"], message: "ids must be unique" });
  }
}).transform(migrateScope);

export type Swimlane = Dashboard["swimlanes"][number];
export type Column = Dashboard["columns"][number];
export type Sort = z.infer<typeof SortSchema>;
export type SortBy = z.infer<typeof SortBySchema>;
export type SortDir = z.infer<typeof SortDirSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type Dashboard = Config["dashboards"][number];

export const StarEpicRequestSchema = z.object({ epic: issueRef, starred: z.boolean() });
export type StarEpicRequest = z.infer<typeof StarEpicRequestSchema>;

export const SyncRequestSchema = z.object({
  repo: repoName.optional(),
  full: z.boolean().default(false),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

/** Free-text filters: set from the filter bar, cleared together by "Clear filters". */
export const TEXT_FILTER_KEYS = ["q", "assignee", "label", "epic"] as const;
export type TextFilterKey = (typeof TEXT_FILTER_KEYS)[number];

export type Filters = { [K in TextFilterKey]?: string } & {
  /** Repos to show, set by the repo chips; unset shows all, empty shows none. */
  repo?: string[];
  /** Repos turned off on any board, kept per browser; only read while `repo` is unset. */
  hide?: string[];
  sort?: SortBy;
  dir?: SortDir;
};

/** The `repo` query value (`owner/a,owner/b`) as a list; absent is unset, `repo=` is empty. */
export function parseRepoFilter(value: string | null | undefined): string[] | undefined {
  return value?.split(",").filter(Boolean);
}

/**
 * The board repos shown: those the URL's `repo` selects when set, else all but the hidden.
 */
export function shownRepos(filters: Filters, boardRepos: string[]): string[] {
  const listed = filters.repo ?? boardRepos.filter((repo) => !filters.hide?.includes(repo));
  return selectedRepos(listed, boardRepos);
}

/** The hidden repos once `selected` is chosen on a board of `boardRepos`; others keep theirs. */
export function hiddenRepos(selected: string[], boardRepos: string[], hidden: string[]): string[] {
  return [
    ...hidden.filter((repo) => !boardRepos.includes(repo)),
    ...boardRepos.filter((repo) => !selected.includes(repo)),
  ];
}

/**
 * The dashboard repos a repo filter selects: those it lists, or all of them when it lists
 * none on the dashboard (a stale URL would otherwise filter with no control to clear it).
 * An empty filter selects none, unless a single-repo dashboard hides the chips.
 */
export function selectedRepos(filter: string[] | undefined, dashboardRepos: string[]): string[] {
  if (filter?.length === 0 && dashboardRepos.length > 1) return [];
  const listed = dashboardRepos.filter((repo) => filter?.includes(repo));
  return listed.length > 0 ? listed : dashboardRepos;
}

/** Inverse of `selectedRepos`: every dashboard repo selected is no filter. */
export function repoFilter(selected: string[], dashboardRepos: string[]): string[] | undefined {
  return dashboardRepos.every((repo) => selected.includes(repo)) ? undefined : selected;
}

const optionalText = z
  .string()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

/** Query-string filters; empty strings count as "not set". */
export const FiltersSchema: z.ZodType<Filters, Record<string, unknown>> = z.object({
  ...(Object.fromEntries(TEXT_FILTER_KEYS.map((key) => [key, optionalText])) as Record<
    TextFilterKey,
    typeof optionalText
  >),
  repo: z.string().optional().transform(parseRepoFilter),
  hide: z.string().optional().transform(parseRepoFilter),
  sort: SortBySchema.optional(),
  dir: SortDirSchema.optional(),
});
