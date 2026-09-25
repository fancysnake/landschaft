import { SyncRequestSchema } from "../../lib/schema";
import { ApiError, json, route } from "../../lib/server/api";
import { getApp } from "../../lib/server/app";
import { allRepos, loadConfig } from "../../lib/server/config";
import { SyncBusyError } from "../../lib/server/sync";

export const POST = route(async ({ request }) => {
  const text = await request.text();
  let raw: unknown = {};
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ApiError(400, "invalid JSON body");
    }
  }
  const body = SyncRequestSchema.parse(raw);
  const { syncer } = getApp();
  if (body.repo) {
    try {
      const result = await syncer.syncRepo(body.repo, { full: body.full });
      return json({ results: [result], status: syncer.status() });
    } catch (error) {
      if (error instanceof SyncBusyError) throw new ApiError(409, error.message);
      throw new ApiError(502, error instanceof Error ? error.message : String(error));
    }
  }
  const results = await syncer.syncAll(allRepos(loadConfig()), { full: body.full });
  return json({ results, status: syncer.status() });
});
