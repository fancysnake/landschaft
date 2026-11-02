import { z } from "zod";

import { filterText, issueRef, repoName, SortBySchema, SortDirSchema } from "./config";
import { type Filters, TEXT_FILTER_KEYS, type TextFilterKey, type UnmatchedQuery } from "./views";

export const StarEpicRequestSchema = z.object({ epic: issueRef, starred: z.boolean() });
export type StarEpicRequest = z.infer<typeof StarEpicRequestSchema>;

export const HiddenReposRequestSchema = z.object({
  repos: z.array(repoName),
  hidden: z.boolean(),
});
export type HiddenReposRequest = z.infer<typeof HiddenReposRequestSchema>;

export const SyncRequestSchema = z.object({
  /** What a sync-all queues instead of every configured repo. */
  repos: z.array(repoName).optional(),
  full: z.boolean().default(false),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

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

/** The unmatched view's query string. */
export const UnmatchedQuerySchema: z.ZodType<UnmatchedQuery, Record<string, unknown>> = z.object({
  filter: filterText.optional(),
});
