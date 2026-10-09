import { ConfigSchema } from "../../lib/schema";
import { json, parseBody, route } from "../../lib/server/api";
import { getApp } from "../../lib/server/app";
import { loadConfig, saveConfig } from "../../lib/server/config";

export const GET = route(() => json(loadConfig()));

export const PUT = route(async ({ request }) => {
  const before = new Set(loadConfig().repos);
  const config = saveConfig(await parseBody(ConfigSchema, request));
  const added = config.repos.filter((repo) => !before.has(repo));
  if (added.length > 0) void getApp().syncer.syncAll(added, { full: true });
  return json(config);
});
