import { z } from "zod";

import { filterError, ISSUE_REF, LOGIN, quoteValue, REPO } from "./filter";
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

/** Stands for the token's account in a dashboard's `users`. */
export const ME = "@me";

/** A GitHub login, or `@me`. */
export const userName = z.string().regex(LOGIN, "expected a GitHub login or @me");

export const DashboardSchema = z
  .object({
    id,
    name: z.string().min(1),
    repos: z.array(repoName).min(1),
    /** Only items these users authored or are assigned to; empty takes everyone's. */
    users: z.array(userName).optional(),
    /** Legacy: "mine" reads as `users: ["@me"]`, "all" as `users: []`. */
    scope: z.enum(["mine", "all"]).optional(),
    epicLabel: z.string().min(1).optional(),
    sort: SortSchema.default({ by: "updated", dir: "desc" }),
    refreshMinutes: z.number().int().min(1).max(1440).default(5),
    swimlanes: z.array(SwimlaneSchema).min(1).transform(migrateAxis("swimlanes")),
    columns: z.array(ColumnSchema).min(1).transform(migrateAxis("columns")),
  })
  .superRefine((dashboard, ctx) => {
    for (const axis of ["swimlanes", "columns"] as const) {
      if (!hasUniqueIds(dashboard[axis])) {
        ctx.addIssue({ code: "custom", path: [axis], message: "ids must be unique" });
      }
    }
  })
  .transform(({ scope, users, ...dashboard }) => ({
    ...dashboard,
    users: users ?? (scope === "all" ? [] : [ME]),
  }));

export const ConfigSchema = z
  .object({
    dashboards: z.array(DashboardSchema).default([]),
  })
  .superRefine((config, ctx) => {
    if (!hasUniqueIds(config.dashboards)) {
      ctx.addIssue({ code: "custom", path: ["dashboards"], message: "ids must be unique" });
    }
  });

export type Swimlane = Dashboard["swimlanes"][number];
export type Column = Dashboard["columns"][number];
export type Sort = z.infer<typeof SortSchema>;
export type SortBy = z.infer<typeof SortBySchema>;
export type SortDir = z.infer<typeof SortDirSchema>;
export type Dashboard = z.infer<typeof DashboardSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type ConfigInput = z.input<typeof ConfigSchema>;

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
  sort?: SortBy;
  dir?: SortDir;
};

/** The `repo` query value (`owner/a,owner/b`) as a list; absent is unset, `repo=` is empty. */
export function parseRepoFilter(value: string | null | undefined): string[] | undefined {
  return value?.split(",").filter(Boolean);
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
  sort: SortBySchema.optional(),
  dir: SortDirSchema.optional(),
});
