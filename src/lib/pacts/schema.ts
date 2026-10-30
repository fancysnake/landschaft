import { z } from "zod";

import {
  FilterError,
  filterError,
  type FilterKey,
  type FilterNode,
  ISSUE_REF,
  LOGIN,
  parseFilter,
  printFilter,
  REPO,
  usesOther,
} from "./filter";
import { isPullStatusLabel, statusValue } from "./status";

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

const term = (key: FilterKey, values: string[]): FilterNode => ({ type: "term", key, values });
const HAS_PR = term("has", ["pr"]);

/** The non-null `nodes` under one `type` node; the node itself when it is alone, null for none. */
function join(type: "and" | "or", maybe: (FilterNode | null)[]): FilterNode | null {
  const nodes = maybe.filter((node) => node !== null);
  return nodes.length > 1 ? { type, nodes } : (nodes[0] ?? null);
}

/**
 * `text` parsed with any value of a known key, as migrations read filters written for an older
 * version; undefined when it does not parse, which validation then reports.
 */
function parseOld(text: string): FilterNode | null | undefined {
  try {
    return parseFilter(text, { check: false });
  } catch (error) {
    if (error instanceof FilterError) return undefined;
    throw error;
  }
}

/** The filter term for a legacy label naming a state, not a GitHub label; null otherwise. */
const stateTerm = (name: string) =>
  name === "is:has-pr" ? HAS_PR : isPullStatusLabel(name) ? term("is", [statusValue(name)]) : null;

/**
 * The filter a legacy group stands for: any → `label:a|b`, all → `label:a label:b`; null for
 * the catch-all, which `migrateAxis` rewrites.
 */
function legacyFilter({
  labels = [],
  match = "any",
  kind = "any",
}: LegacyGroup): FilterNode | null {
  const plain = labels.filter((name) => stateTerm(name) === null);
  const statuses = labels.map(stateTerm);
  const anyLabel = plain.length > 0 ? term("label", plain) : null;
  const labelTerms = match === "all" ? plain.map((name) => term("label", [name])) : [anyLabel];
  const body = join(match === "all" ? "and" : "or", [...labelTerms, ...statuses]);
  return join("and", [kind === "any" ? null : term("is", [kind]), body]);
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
 * catch-all took what no other entry took: `other` excludes the entries it looks at, a `-`
 * each of the rest.
 */
const migrateAxis =
  (axis: Axis) =>
  <T extends LegacyGroup & { filter?: string }>(groups: T[]) => {
    // A transform runs after validation, so an explicit filter parses.
    const nodeOf = ({ labels, match, kind, filter }: T) =>
      filter === undefined ? legacyFilter({ labels, match, kind }) : parseFilter(filter);
    return groups.map(({ labels, match, kind, filter, ...group }, index) => {
      if (filter !== undefined) return { ...group, filter };
      const own = legacyFilter({ labels, match, kind });
      if (own !== null) return { ...group, filter: printFilter(own) };
      const unseen =
        OTHER_LOOKS_AT[axis] === "earlier" ? groups.slice(index + 1) : groups.slice(0, index);
      const excluded = unseen.map(nodeOf).map((node) => node && { type: "not" as const, node });
      return { ...group, filter: printFilter(join("and", [{ type: "other" }, ...excluded])) };
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

/** A config object as read from JSON, before validation. */
type Raw = Record<string, unknown>;
export const isRaw = (value: unknown): value is Raw =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** What every dashboard type has. */
const shared = {
  id,
  name: z.string().min(1),
  /** Narrows the global base set; empty takes all of it. */
  filter: dashboardFilter.default(""),
  sort: SortSchema.default({ by: "updated", dir: "desc" }),
  /** Items closed within this many days stay on the dashboard; 0 shows open items only. */
  closedDays: z.number().int().min(0).max(365).default(0),
};

const BoardDashboardSchema = z
  .object({
    type: z.literal("board"),
    ...shared,
    epicLabel: z.string().min(1).optional(),
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

/** An inbox group; an item lands in the first one whose filter it matches. */
export const InboxGroupSchema = z.object({
  id,
  name: z.string().min(1),
  /** `other` holds for every item that reaches the group: an earlier match would have taken it. */
  filter: filterText.default(""),
  collapsed: z.boolean().default(false),
});

const InboxDashboardSchema = z
  .object({
    type: z.literal("inbox"),
    ...shared,
    groups: z.array(InboxGroupSchema).default([]),
  })
  .superRefine((dashboard, ctx) => {
    if (!hasUniqueIds(dashboard.groups)) {
      ctx.addIssue({ code: "custom", path: ["groups"], message: "ids must be unique" });
    }
  });

/** A dashboard without `type` predates the inbox, so it is a board. */
export const DashboardSchema = z.preprocess(
  (dashboard) =>
    isRaw(dashboard) && dashboard.type === undefined ? { type: "board", ...dashboard } : dashboard,
  z.discriminatedUnion("type", [BoardDashboardSchema, InboxDashboardSchema]),
);
/** A legacy list field as a list; malformed values stay in for validation to report. */
const list = (value: unknown): unknown[] => (value === undefined ? [] : [value].flat());
const union = (lists: unknown[][]) => [...new Set(lists.flat())];
const sameSet = (a: unknown[], b: unknown[]) =>
  a.length === b.length && a.every((value) => b.includes(value));
/** Legacy `scope`: "mine" reads as `users: ["@me"]`, "all" as `users: []`. */
const legacyUsers = (dashboard: Raw) =>
  dashboard.users === undefined ? (dashboard.scope === "all" ? [] : [ME]) : list(dashboard.users);

/**
 * Lifts a config whose dashboards have `repos`, which predates the global scope, into one with
 * global `repos`: its repos and users are the unions of the dashboards' (users empty when any
 * dashboard took everyone's), its refresh interval the shortest any had, and a dashboard narrower
 * than the union gets a `repo:`/`user:` filter. Runs before validation, which strips the leftover
 * fields.
 */
function migrateScope(config: unknown): unknown {
  if (!isRaw(config) || config.repos !== undefined || !Array.isArray(config.dashboards)) {
    return config;
  }
  const dashboards: unknown[] = config.dashboards;
  if (!dashboards.every(isRaw) || !dashboards.some((d) => d.repos !== undefined)) return config;
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
      own.length === 0 || sameSet(own, all) ? [] : [term(key, own.map(String))],
    );
    const filter = parseOld(String(dashboard.filter ?? ""));
    // A filter that does not parse fails validation, so the narrowing would never be saved.
    if (parts.length === 0 || filter === undefined) return dashboard;
    return {
      ...dashboard,
      filter: printFilter(join("and", [filter, ...parts])),
    };
  };
  return {
    ...config,
    ...global,
    dashboards: dashboards.map(narrow),
  };
}

/** The config version this build writes; a config without `version` is version 0. */
export const CONFIG_VERSION = 2;

/** `value` with `step` applied to each of its items that is an object, if it is an array. */
const mapRaw = (value: unknown, step: (raw: Raw) => Raw): unknown =>
  Array.isArray(value) ? value.map((item: unknown) => (isRaw(item) ? step(item) : item)) : value;

/** `config` with `step` applied to each dashboard. */
const mapDashboards = (config: Raw, step: (dashboard: Raw) => Raw): Raw =>
  Array.isArray(config.dashboards)
    ? { ...config, dashboards: mapRaw(config.dashboards, step) }
    : config;

/** `dashboard` with `rewrite` applied to its own filter and to each of its groups'. */
function mapFilters(dashboard: Raw, rewrite: (filter: string) => string): Raw {
  const withFilter = (raw: Raw): Raw =>
    typeof raw.filter === "string" ? { ...raw, filter: rewrite(raw.filter) } : raw;
  const groups = (["swimlanes", "columns", "groups"] as const)
    .filter((key) => Array.isArray(dashboard[key]))
    .map((key) => [key, mapRaw(dashboard[key], withFilter)]);
  return { ...withFilter(dashboard), ...Object.fromEntries(groups) };
}

/** Puts a swimlane for failed CI jobs on top, under an id no lane there has. */
function withCiLane(dashboard: Raw): Raw {
  if (!Array.isArray(dashboard.swimlanes)) return dashboard;
  const lanes: unknown[] = dashboard.swimlanes;
  const taken = new Set(lanes.map((lane) => (isRaw(lane) ? lane.id : undefined)));
  let laneId = "ci-jobs";
  for (let n = 2; taken.has(laneId); n += 1) laneId = `ci-jobs-${n}`;
  const lane = { id: laneId, name: "Failed CI", filter: "is:ci-job" };
  return { ...dashboard, swimlanes: [lane, ...lanes] };
}

/** Version 1 brought failed CI jobs, which no lane of an older dashboard asks for. */
const addCiLane = (config: Raw) => mapDashboards(config, withCiLane);

/**
 * `node` with `is:has-pr` written as `has:pr`: `is:a|has-pr` turns into `is:a OR has:pr`;
 * `node` itself when it holds no `is:has-pr`.
 */
function renameHasPrIn(node: FilterNode): FilterNode {
  if (node.type === "not") {
    const inner = renameHasPrIn(node.node);
    return inner === node.node ? node : { ...node, node: inner };
  }
  if (node.type === "and" || node.type === "or") {
    const nodes = node.nodes.map(renameHasPrIn);
    return nodes.every((child, index) => child === node.nodes[index]) ? node : { ...node, nodes };
  }
  if (node.type !== "term" || node.key !== "is") return node;
  const values = node.values.filter((value) => value.toLowerCase() !== "has-pr");
  if (values.length === node.values.length) return node;
  return values.length > 0 ? { type: "or", nodes: [{ ...node, values }, HAS_PR] } : HAS_PR;
}

/** `filter` with `renameHasPrIn` applied; as written when that changes nothing. */
function hasPrFilter(filter: string): string {
  const node = parseOld(filter);
  if (!node) return filter;
  const renamed = renameHasPrIn(node);
  return renamed === node ? filter : printFilter(renamed);
}

/** Version 2 renamed `is:has-pr` to `has:pr`; `legacyFilter` takes care of a legacy label. */
const renameHasPr = (config: Raw) =>
  mapDashboards(config, (dashboard) => mapFilters(dashboard, hasPrFilter));

/** `UPGRADES[n]` takes a version-n config to version n + 1. */
const UPGRADES: ((config: Raw) => Raw)[] = [addCiLane, renameHasPr];

/**
 * Brings a config up to `CONFIG_VERSION` one step at a time. A version this build does not know
 * is left for validation to reject.
 */
function upgradeConfig(config: unknown): unknown {
  if (!isRaw(config)) return config;
  const from = config.version ?? 0;
  if (typeof from !== "number" || !Number.isInteger(from) || from < 0 || from > CONFIG_VERSION) {
    return config;
  }
  const upgraded = UPGRADES.slice(from).reduce((raw, step) => step(raw), config);
  return { ...upgraded, version: CONFIG_VERSION };
}

export const ConfigSchema = z.preprocess(
  (config: unknown) => upgradeConfig(migrateScope(config)),
  z
    .object({
      version: z.literal(CONFIG_VERSION),
      /** Every board starts from the open items in these repos… */
      repos: z.array(repoName).default([]),
      /** …that these users authored or are assigned to; empty takes everyone's. */
      users: z.array(userName).default([]),
      /** Repos switched off in the nav; every view leaves their items out. */
      hiddenRepos: z.array(repoName).default([]),
      refreshMinutes: refreshMinutes.default(5),
      dashboards: z.array(DashboardSchema).default([]),
    })
    .superRefine((config, ctx) => {
      if (!hasUniqueIds(config.dashboards)) {
        ctx.addIssue({ code: "custom", path: ["dashboards"], message: "ids must be unique" });
      }
    })
    // A repo dropped from `repos` is not kept switched off for when it comes back.
    .transform((config) => ({
      ...config,
      hiddenRepos: config.hiddenRepos.filter((repo) => config.repos.includes(repo)),
    })),
);

export type BoardDashboard = Extract<Dashboard, { type: "board" }>;
export type InboxDashboard = Extract<Dashboard, { type: "inbox" }>;
export type DashboardType = Dashboard["type"];
export type Swimlane = BoardDashboard["swimlanes"][number];
export type Column = BoardDashboard["columns"][number];
export type InboxGroup = InboxDashboard["groups"][number];
export type Sort = z.infer<typeof SortSchema>;
export type SortBy = z.infer<typeof SortBySchema>;
export type SortDir = z.infer<typeof SortDirSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type Dashboard = Config["dashboards"][number];

/** The fields every dashboard type has. */
export type DashboardBase = Pick<Dashboard, keyof typeof shared>;

/** A fresh dashboard of `type` keeping `base`, the fields every type has. */
export function withType(type: DashboardType, from: DashboardBase): Dashboard {
  const base: DashboardBase = {
    id: from.id,
    name: from.name,
    filter: from.filter,
    sort: from.sort,
    closedDays: from.closedDays,
  };
  return type === "board"
    ? {
        type,
        ...base,
        swimlanes: [{ id: "all", name: "Everything", filter: "", hideBlocked: false }],
        columns: [{ id: "todo", name: "Todo", filter: "" }],
      }
    : { type, ...base, groups: [] };
}

export function findDashboard(config: Config, dashboardId: string): Dashboard | undefined {
  return config.dashboards.find((dashboard) => dashboard.id === dashboardId);
}

/** The longest window any dashboard shows closed items for, in days; what a full sync fetches. */
export const closedDays = (config: { dashboards: Pick<Dashboard, "closedDays">[] }): number =>
  Math.max(0, ...config.dashboards.map((dashboard) => dashboard.closedDays));

const DAY_MS = 24 * 60 * 60 * 1000;

/** The earliest close time, in ms, a window of `days` back from `now` keeps; Infinity for 0. */
export const closedSince = (days: number, now: Date): number =>
  days > 0 ? now.getTime() - days * DAY_MS : Number.POSITIVE_INFINITY;

/**
 * The repos a full sync must fetch once the config goes from `previous` to `next`: every one when
 * the closed window grew, since the older closed items are missing, otherwise the added ones.
 */
export function reposToResync(
  previous: { repos: string[]; dashboards: Pick<Dashboard, "closedDays">[] },
  next: { repos: string[]; dashboards: Pick<Dashboard, "closedDays">[] },
): string[] {
  if (closedDays(next) > closedDays(previous)) return next.repos;
  const before = new Set(previous.repos);
  return next.repos.filter((repo) => !before.has(repo));
}

export const StarEpicRequestSchema = z.object({ epic: issueRef, starred: z.boolean() });
export type StarEpicRequest = z.infer<typeof StarEpicRequestSchema>;

export const HiddenReposRequestSchema = z.object({
  repos: z.array(repoName),
  hidden: z.boolean(),
});
export type HiddenReposRequest = z.infer<typeof HiddenReposRequestSchema>;

export const SyncRequestSchema = z.object({
  repo: repoName.optional(),
  full: z.boolean().default(false),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

/** Free-text filters: set from the filter bar, cleared together by "Clear filters". */
export const TEXT_FILTER_KEYS = ["q", "assignee", "label", "type", "epic", "job"] as const;
export type TextFilterKey = (typeof TEXT_FILTER_KEYS)[number];

export type Filters = { [K in TextFilterKey]?: string } & {
  sort?: SortBy;
  dir?: SortDir;
};

/** What a view is built from: the URL filters plus the repos switched off in the config. */
export type ViewQuery = Filters & {
  hide?: string[];
};

const optionalText = z
  .string()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

/** The view endpoints' query string; empty strings count as "not set". */
export const ViewQuerySchema: z.ZodType<Filters, Record<string, unknown>> = z.object({
  ...(Object.fromEntries(TEXT_FILTER_KEYS.map((key) => [key, optionalText])) as Record<
    TextFilterKey,
    typeof optionalText
  >),
  sort: SortBySchema.optional(),
  dir: SortDirSchema.optional(),
});

/** What the unmatched view is built from: the repos switched off and a filter on the items. */
export interface UnmatchedQuery {
  hide?: string[];
  filter?: string;
}

/** The unmatched view's query string. */
export const UnmatchedQuerySchema: z.ZodType<
  Omit<UnmatchedQuery, "hide">,
  Record<string, unknown>
> = z.object({
  filter: filterText.optional(),
});
