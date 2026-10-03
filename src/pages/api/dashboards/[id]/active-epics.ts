import { ActiveEpicRequestSchema } from "../../../../lib/schema";
import { ApiError, json, parseBody, route } from "../../../../lib/server/api";
import { findDashboard, loadConfig, saveConfig } from "../../../../lib/server/config";

export const POST = route(async ({ params, request }) => {
  const { epic, active } = await parseBody(ActiveEpicRequestSchema, request);
  const config = loadConfig();
  const dashboard = findDashboard(config, params.id ?? "");
  if (!dashboard) throw new ApiError(404, "dashboard not found");
  const others = dashboard.activeEpics.filter((key) => key !== epic);
  dashboard.activeEpics = active ? [...others, epic] : others;
  saveConfig(config);
  return json({ activeEpics: dashboard.activeEpics });
});
