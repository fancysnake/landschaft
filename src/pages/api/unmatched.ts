import { parseFilter } from "../../lib/filter";
import { UnmatchedQuerySchema } from "../../lib/schema";
import { json, parseQuery, route } from "../../lib/server/api";
import { getApp } from "../../lib/server/app";
import { unmatchedItems } from "../../lib/server/board";
import { loadConfig } from "../../lib/server/config";

export const GET = route(async (context) => {
  const { dashboards, repos, users } = loadConfig();
  const { hide = [], filter = "" } = parseQuery(UnmatchedQuerySchema, context.url);
  const { db, syncer } = getApp();
  const viewer = await syncer.viewer().catch(() => null);
  const { items, offer } = unmatchedItems(db.snapshot(repos), dashboards, {
    users,
    viewer,
    hide,
    filter: parseFilter(filter),
  });
  return json({ items, offer, status: syncer.status() });
});
