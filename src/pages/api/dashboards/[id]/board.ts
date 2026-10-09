import { FiltersSchema } from "../../../../lib/schema";
import { ApiError, json, parseQuery, route } from "../../../../lib/server/api";
import { getApp } from "../../../../lib/server/app";
import { buildBoard, resolveUsers } from "../../../../lib/server/board";
import { findDashboard, loadConfig } from "../../../../lib/server/config";

export const GET = route(async ({ params, url }) => {
  const config = loadConfig();
  const dashboard = findDashboard(config, params.id ?? "");
  if (!dashboard) throw new ApiError(404, "dashboard not found");
  const filters = parseQuery(FiltersSchema, url);
  const { db, syncer } = getApp();
  const viewer = await syncer.viewer().catch(() => null);
  const users = config.users.length > 0 ? resolveUsers(config.users, viewer) : null;
  const board = buildBoard(
    db.listIssues(config.repos),
    dashboard,
    filters,
    users,
    db.starredEpics(dashboard.id),
    viewer,
  );
  return json({ dashboard, board, status: syncer.status() });
});
