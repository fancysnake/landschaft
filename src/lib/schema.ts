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
  })
  .superRefine((dashboard, ctx) => {
    for (const axis of ["swimlanes", "columns"] as const) {
      if (!hasUniqueIds(dashboard[axis])) {
        ctx.addIssue({ code: "custom", path: [axis], message: "ids must be unique" });
      }
    }
  });

/** A config object as read from JSON, before validation. */
type Raw = Record<string, unknown>;
const isRaw = (value: unknown): value is Raw =>
  typeof value === "object" && value !== null && !Array.isArray(value);
/** A legacy list field as a list; malformed values stay in for validation to report. */
const list = (value: unknown): unknown[] => (value === undefined ? [] : [value].flat());
const union = (lists: unknown[][]) => [...new Set(lists.flat())];
const sameSet = (a: unknown[], b: unknown[]) =>
  a.length === b.length && a.every((value) => b.includes(value));
/** Legacy `scope`: "mine" reads as `users: ["@me"]`, "all" as `users: []`. */
const legacyUsers = (dashboard: Raw) =>
  dashboard.users === undefined ? (dashboard.scope === "all" ? [] : [ME]) : list(dashboard.users);

/**
 * Lifts a config without global `repos`, which predates the global scope, into one with it: its
 * repos and users are the unions of the dashboards' (users empty when any dashboard took
 * everyone's), its refresh interval the shortest any had, and a dashboard narrower than the union
 * gets a `repo:`/`user:` filter. Runs before validation, which strips the leftover fields.
 */
function migrateScope(config: unknown): unknown {
  if (!isRaw(config) || config.repos !== undefined || !Array.isArray(config.dashboards)) {
    return config;
  }
  const dashboards: unknown[] = config.dashboards;
  if (!dashboards.every(isRaw)) return config;
  const global = {
    repos: union(dashboards.map((dashboard) => list(dashboard.repos))),
    users:
      config.users ??
      (dashboards.every((dashboard) => legacyUsers(dashboard).length > 0)
        ? union(dashboards.map(legacyUsers))
        : []),
    refreshMinutes:
      config.refreshMinutes ??
      (dashboards.length > 0
        ? Math.min(...dashboards.map((dashboard) => Number(dashboard.refreshMinutes ?? 5)))
        : undefined),
  };
  const narrow = (dashboard: Raw): Raw => {
    const scopes = [
      ["repo", list(dashboard.repos), global.repos],
      ["user", legacyUsers(dashboard), list(global.users)],
    ] as const;
    const parts = scopes.flatMap(([key, own, all]) =>
      own.length === 0 || sameSet(own, all) ? [] : [`${key}:${own.join("|")}`],
    );
    if (parts.length === 0) return dashboard;
    const filter = dashboard.filter ? [`(${String(dashboard.filter)})`] : [];
    return { ...dashboard, filter: [...filter, ...parts].join(" ") };
  };
  return {
    ...config,
    ...global,
    dashboards: dashboards.map(narrow),
  };
}

export const ConfigSchema = z.preprocess(
  migrateScope,
  z
    .object({
      /** Every board starts from the open items in these repos… */
      repos: z.array(repoName).default([]),
      /** …that these users authored or are assigned to; empty takes everyone's. */
      users: z.array(userName).default([]),
      refreshMinutes: refreshMinutes.default(5),
      dashboards: z.array(DashboardSchema).default([]),
    })
    .superRefine((config, ctx) => {
      if (!hasUniqueIds(config.dashboards)) {
        ctx.addIssue({ code: "custom", path: ["dashboards"], message: "ids must be unique" });
      }
    }),
);

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
  sort?: SortBy;
  dir?: SortDir;
};

/** What the board endpoint takes: the URL filters plus the repos hidden in this browser. */
export type BoardQuery = Filters & {
  /** Repos switched off in the nav, kept per browser. */
  hide?: string[];
};

const optionalText = z
  .string()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

/** The board query string; empty strings count as "not set". */
export const BoardQuerySchema: z.ZodType<BoardQuery, Record<string, unknown>> = z.object({
  ...(Object.fromEntries(TEXT_FILTER_KEYS.map((key) => [key, optionalText])) as Record<
    TextFilterKey,
    typeof optionalText
  >),
  hide: z
    .string()
    .optional()
    .transform((value) => value?.split(",").filter(Boolean)),
  sort: SortBySchema.optional(),
  dir: SortDirSchema.optional(),
});
