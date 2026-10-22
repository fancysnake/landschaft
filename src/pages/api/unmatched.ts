import { UnmatchedQuerySchema } from "../../lib/schema";
import { json, parseQuery, route, viewData } from "../../lib/server/api";
import { getApp } from "../../lib/server/app";
import { unmatchedItems } from "../../lib/server/board";
import { loadConfig } from "../../lib/server/config";

export const GET = route(async (context) => {
  const config = loadConfig();
  const query = parseQuery(UnmatchedQuerySchema, context.url);
  const { snapshot, ...audience } = await viewData(config);
  const { items, offer } = unmatchedItems(snapshot, config.dashboards, { ...audience, query });
  return json({ items, offer, status: getApp().syncer.status() });
});
