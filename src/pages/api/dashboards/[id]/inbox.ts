import { BoardQuerySchema } from "../../../../lib/schema";
import { ApiError, json, parseQuery, route } from "../../../../lib/server/api";
import { getApp } from "../../../../lib/server/app";
import { buildInbox } from "../../../../lib/server/board";
import { findDashboard, loadConfig } from "../../../../lib/server/config";

export const GET = route(async ({ params, url }) => {
  const config = loadConfig();
  const dashboard = findDashboard(config, params.id ?? "");
  if (dashboard?.type !== "inbox") throw new ApiError(404, "inbox not found");
  const query = parseQuery(BoardQuerySchema, url);
  const { db, syncer } = getApp();
  const viewer = await syncer.viewer().catch(() => null);
  const inbox = buildInbox(db.listIssues(config.repos), dashboard, query, config.users, viewer);
  return json({ dashboard, inbox, status: syncer.status() });
});
