import { StarEpicRequestSchema } from "../../../../lib/schema";
import { ApiError, json, parseBody, route } from "../../../../lib/server/api";
import { getApp } from "../../../../lib/server/app";
import { findDashboard, loadConfig } from "../../../../lib/server/config";
import { parseIssueKey } from "../../../../lib/types";

export const POST = route(async ({ params, request }) => {
  const { epic, starred } = await parseBody(StarEpicRequestSchema, request);
  const config = loadConfig();
  const dashboard = findDashboard(config, params.id ?? "");
  if (!dashboard) throw new ApiError(404, "dashboard not found");
  if (starred && !config.repos.includes(parseIssueKey(epic)?.repo ?? "")) {
    throw new ApiError(400, "epic is not in a configured repository");
  }
  const { db } = getApp();
  db.setEpicStarred(dashboard.id, epic, starred);
  return json({ starredEpics: [...db.starredEpics(dashboard.id)] });
});
