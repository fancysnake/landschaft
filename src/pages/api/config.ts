import { closedDays, ConfigSchema } from "../../lib/schema";
import { json, parseBody, route } from "../../lib/server/api";
import { getApp } from "../../lib/server/app";
import { loadConfig, saveConfig } from "../../lib/server/config";

export const GET = route(() => json(loadConfig()));

export const PUT = route(async ({ request }) => {
  const previous = loadConfig();
  const before = new Set(previous.repos);
  const config = saveConfig(await parseBody(ConfigSchema, request));
  const days = closedDays(config);
  // A longer closed window needs a full sync of every repo to fetch the older closed items.
  const repos =
    days > closedDays(previous) ? config.repos : config.repos.filter((repo) => !before.has(repo));
  if (repos.length > 0) void getApp().syncer.syncAll(repos, { full: true, closedDays: days });
  return json(config);
});
