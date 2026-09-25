import { z } from "zod";

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

export const SwimlaneSchema = z.object({
  id,
  name: z.string().min(1),
  labels: labelList,
  match: MatchSchema.default("any"),
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

function countCatchAlls(items: { labels: string[] }[]): number {
  return items.filter((item) => item.labels.length === 0).length;
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
      if (countCatchAlls(dashboard[axis]) > 1) {
        ctx.addIssue({
          code: "custom",
          path: [axis],
          message: "at most one catch-all (no labels) allowed",
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

export interface Filters {
  q?: string;
  assignee?: string;
  label?: string;
  epic?: string;
  sort?: SortBy;
  dir?: SortDir;
}

const optionalText = z
  .string()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

/** Query-string filters; empty strings count as "not set". */
export const FiltersSchema: z.ZodType<Filters, Record<string, unknown>> = z.object({
  q: optionalText,
  assignee: optionalText,
  label: optionalText,
  epic: optionalText,
  sort: SortBySchema.optional(),
  dir: SortDirSchema.optional(),
});
