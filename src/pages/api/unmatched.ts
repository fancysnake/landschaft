import { getApp } from "../../lib/inits";
import { loadConfig } from "../../lib/links/config/file";
import { unmatchedItems } from "../../lib/mills/board";
import { UnmatchedQuerySchema } from "../../lib/pacts/schema";
import { json, parseQuery, route, viewData } from "./_route";

export const GET = route(async (context) => {
  const config = loadConfig();
  const query = parseQuery(UnmatchedQuerySchema, context.url);
  const { snapshot, ...audience } = await viewData(config);
  const { items, offer } = unmatchedItems(snapshot, config.dashboards, { ...audience, query });
  return json({ items, offer, status: getApp().syncer.status() });
});
