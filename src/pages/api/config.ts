import { ConfigSchema, reposToResync } from "../../lib/schema";
import { json, parseBody, route } from "../../lib/server/api";
import { getApp } from "../../lib/server/app";
import { loadConfig, saveConfig } from "../../lib/server/config";

export const GET = route(() => json(loadConfig()));

export const PUT = route(async ({ request }) => {
  const previous = loadConfig();
  const config = saveConfig(await parseBody(ConfigSchema, request));
  const repos = reposToResync(previous, config);
  if (repos.length > 0) void getApp().syncer.syncAll(repos, { full: true });
  return json(config);
});
