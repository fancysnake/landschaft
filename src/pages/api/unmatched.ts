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
  const items = unmatchedIssues(db.listIssues(repos), dashboards, users, viewer, hide);
  return json({ items, status: syncer.status() });
});
