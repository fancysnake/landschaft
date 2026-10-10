import { json, route } from "../../../lib/server/api";
import { getApp } from "../../../lib/server/app";
import { buildBoard } from "../../../lib/server/board";
import { loadConfig } from "../../../lib/server/config";

export const GET = route(async () => {
  const config = loadConfig();
  const { db, syncer } = getApp();
  const viewer = await syncer.viewer().catch(() => null);
  const issues = db.listIssues(config.repos);
  // shortcut: lays out every board to learn its repos; split the scoping out of buildBoard if this gets slow
  const dashboards = config.dashboards.map((dashboard) => ({
    id: dashboard.id,
    repos: buildBoard(issues, dashboard, {}, config.users, new Set(), viewer).repos,
  }));
  return json({ dashboards });
});
