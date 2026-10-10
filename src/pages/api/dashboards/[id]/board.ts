import { BoardQuerySchema } from "../../../../lib/schema";
import { ApiError, json, parseQuery, route } from "../../../../lib/server/api";
import { getApp } from "../../../../lib/server/app";
import { buildBoard } from "../../../../lib/server/board";
import { findDashboard, loadConfig } from "../../../../lib/server/config";

export const GET = route(async ({ params, url }) => {
  const config = loadConfig();
  const dashboard = findDashboard(config, params.id ?? "");
  if (!dashboard) throw new ApiError(404, "dashboard not found");
  const query = parseQuery(BoardQuerySchema, url);
  const { db, syncer } = getApp();
  const viewer = await syncer.viewer().catch(() => null);
  const board = buildBoard(
    db.listIssues(config.repos),
    dashboard,
    query,
    config.users,
    db.starredEpics(dashboard.id),
    viewer,
  );
  return json({ dashboard, board, status: syncer.status() });
});
