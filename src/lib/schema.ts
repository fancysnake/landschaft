import { z } from "zod";

import type { IssueKind } from "./types";

const id = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9_-]+$/i, "letters, digits, - and _ only");
export const repoName = z.string().regex(/^[\w.-]+\/[\w.-]+$/, "expected owner/repo");
const labelList = z.array(z.string().min(1)).default([]);
/** "any": the issue carries at least one of the labels; "all": it carries every one. */
export const MatchSchema = z.enum(["any", "all"]);
export type Match = z.infer<typeof MatchSchema>;
/** Which items a swimlane takes: both, only issues, or only pull requests. */
export const KindFilterSchema = z.enum(["any", "issue", "pr"]);
export type KindFilter = z.infer<typeof KindFilterSchema>;

export const SwimlaneSchema = z.object({
  id,
  name: z.string().min(1),
  labels: labelList,
  match: MatchSchema.default("any"),
  kind: KindFilterSchema.default("any"),
  hideBlocked: z.boolean().default(false),
});

export const ColumnSchema = z.object({
  id,
  name: z.string().min(1),
  labels: labelList,
  match: MatchSchema.default("any"),
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

/** No labels and no kind restriction: takes whatever no other entry does. */
export function isCatchAll(group: { labels: string[]; kind?: KindFilter }): boolean {
  return group.labels.length === 0 && (group.kind ?? "any") === "any";
}

/** Whether a swimlane's kind filter lets an item of this kind in. */
export function fitsKind(filter: KindFilter, kind: IssueKind): boolean {
  return filter === "any" || filter === kind;
}

/** "mine": only issues the viewer created or is assigned to; "all": every open issue. */
export const ScopeSchema = z.enum(["mine", "all"]);
export type Scope = z.infer<typeof ScopeSchema>;

export const DashboardSchema = z
  .object({
    id,
    name: z.string().min(1),
    repos: z.array(repoName).min(1),
    scope: ScopeSchema.default("mine"),
    epicLabel: z.string().min(1).optional(),
    sort: SortSchema.default({ by: "updated", dir: "desc" }),
    refreshMinutes: z.number().int().min(1).max(1440).default(5),
    swimlanes: z.array(SwimlaneSchema).min(1),
    columns: z.array(ColumnSchema).min(1),
  })
  .superRefine((dashboard, ctx) => {
    for (const axis of ["swimlanes", "columns"] as const) {
      if (!hasUniqueIds(dashboard[axis])) {
        ctx.addIssue({ code: "custom", path: [axis], message: "ids must be unique" });
      }
      if (dashboard[axis].filter(isCatchAll).length > 1) {
        ctx.addIssue({
          code: "custom",
          path: [axis],
          message: `at most one catch-all (${axis === "swimlanes" ? "no labels, any kind" : "no labels"}) allowed`,
        });
      }
    }
  });

export const ConfigSchema = z
  .object({
    dashboards: z.array(DashboardSchema).default([]),
  })
  .superRefine((config, ctx) => {
    if (!hasUniqueIds(config.dashboards)) {
      ctx.addIssue({ code: "custom", path: ["dashboards"], message: "ids must be unique" });
    }
  });

export type Swimlane = z.infer<typeof SwimlaneSchema>;
export type Column = z.infer<typeof ColumnSchema>;
export type Sort = z.infer<typeof SortSchema>;
export type SortBy = z.infer<typeof SortBySchema>;
export type SortDir = z.infer<typeof SortDirSchema>;
export type Dashboard = z.infer<typeof DashboardSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type ConfigInput = z.input<typeof ConfigSchema>;

const PositionSchema = z.object({ laneId: id, colId: id });

export const MoveRequestSchema = z.object({
  dashboardId: id,
  repo: repoName,
  number: z.number().int().positive(),
  from: PositionSchema,
  to: PositionSchema,
});
export type MoveRequest = z.infer<typeof MoveRequestSchema>;

export const SyncRequestSchema = z.object({
  repo: repoName.optional(),
  full: z.boolean().default(false),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

/** Free-text filters: set from the filter bar, cleared together by "Clear filters". */
export const TEXT_FILTER_KEYS = ["q", "assignee", "label", "epic"] as const;
export type TextFilterKey = (typeof TEXT_FILTER_KEYS)[number];

export type Filters = { [K in TextFilterKey]?: string } & {
  /** Repos to show, set by the repo chips; unset shows all. */
  repo?: string[];
  sort?: SortBy;
  dir?: SortDir;
};

/** The `repo` query value (`owner/a,owner/b`) as a list; empty means unset. */
export function parseRepoFilter(value: string | null | undefined): string[] | undefined {
  const repos = value?.split(",").filter(Boolean) ?? [];
  return repos.length > 0 ? repos : undefined;
}

/**
 * The dashboard repos a repo filter selects: those it lists, or all of them when it lists
 * none on the dashboard (a stale URL would otherwise filter with no control to clear it).
 */
export function selectedRepos(filter: string[] | undefined, dashboardRepos: string[]): string[] {
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
