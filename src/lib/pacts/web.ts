import { z } from "zod";

import { filterText, repoName, SortBySchema, SortDirSchema } from "./config";
import { type Filters, TEXT_FILTER_KEYS, type TextFilterKey, type UnmatchedQuery } from "./views";

export const SyncRequestSchema = z.strictObject({
  /** What a sync-all queues instead of every configured repo. */
  repos: z.array(repoName).optional(),
  full: z.boolean().default(false),
  /** Leaves out the repos whose last sync succeeded within `FRESH_SYNC_MS`. */
  stale: z.boolean().default(false),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

/** The browser cookie that lists the repos switched off, comma-separated. */
export const HIDDEN_REPOS_COOKIE = "landschaft_hidden_repos";

/** The cookie that switches `repos` off, as a `document.cookie` assignment. */
export const hiddenReposCookie = (repos: string[]) =>
  `${HIDDEN_REPOS_COOKIE}=${encodeURIComponent(repos.join(","))}; path=/; max-age=34560000; samesite=lax`;

/** The repos a request's `cookies` switch off; entries that are no repo name are dropped. */
export const hiddenRepos = (cookies: { get(name: string): { value: string } | undefined }) =>
  (cookies.get(HIDDEN_REPOS_COOKIE)?.value.split(",") ?? []).filter(
    (repo) => repoName.safeParse(repo).success,
  );

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
