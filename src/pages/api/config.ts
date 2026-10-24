import { getApp } from "../../lib/inits";
import { loadConfig, saveConfig } from "../../lib/links/config/file";
import { ConfigSchema, reposToResync } from "../../lib/pacts/schema";
import { json, parseBody, route } from "./_route";

export const GET = route(() => json(loadConfig()));

export const PUT = route(async ({ request }) => {
  const previous = loadConfig();
  const config = saveConfig(await parseBody(ConfigSchema, request));
  const repos = reposToResync(previous, config);
  if (repos.length > 0) void getApp().syncer.syncAll(repos, { full: true });
  return json(config);
});
