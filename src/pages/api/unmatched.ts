import type { UnmatchedItem } from "../../lib/types";

import { UnmatchedQuerySchema } from "../../lib/schema";
import { json, parseQuery, route } from "../../lib/server/api";
import { getApp } from "../../lib/server/app";
import { unmatchedIssues } from "../../lib/server/board";
import { loadConfig } from "../../lib/server/config";

export const GET = route(async (context) => {
  const { dashboards, repos, users } = loadConfig();
  const { hide = [] } = parseQuery(UnmatchedQuerySchema, context.url);
  const { db, syncer } = getApp();
  const viewer = await syncer.viewer().catch(() => null);
  // Hidden repos are dropped after placement: their items still count for `is:has-pr` and blockers.
  const items: UnmatchedItem[] = unmatchedIssues(db.listIssues(repos), dashboards, users, viewer)
    .filter((issue) => !hide.includes(issue.repo))
    .map(({ kind, repo, number, title, url, labels }) => ({
      kind,
      repo,
      number,
      title,
      url,
      labels,
    }));
  return json({ items, status: syncer.status() });
});
