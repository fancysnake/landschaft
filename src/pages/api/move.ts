import { MoveRequestSchema } from "../../lib/schema";
import { ApiError, json, parseBody, route } from "../../lib/server/api";
import { getApp } from "../../lib/server/app";
import { findDashboard, loadConfig } from "../../lib/server/config";
import { MoveError, moveIssue } from "../../lib/server/move";

export const POST = route(async ({ request }) => {
  const body = await parseBody(MoveRequestSchema, request);
  const dashboard = findDashboard(loadConfig(), body.dashboardId);
  if (!dashboard) throw new ApiError(404, "dashboard not found");
  try {
    return json(await moveIssue(getApp(), dashboard, body));
  } catch (error) {
    if (error instanceof MoveError) throw new ApiError(400, error.message);
    throw error;
  }
});
