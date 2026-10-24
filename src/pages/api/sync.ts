import { getApp } from "../../lib/inits";
import { loadConfig } from "../../lib/links/config/file";
import { SyncBusyError } from "../../lib/mills/sync";
import { SyncRequestSchema } from "../../lib/pacts/schema";
import { ApiError, json, route } from "./_route";

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
  // The run ends once /api/version reports `runs >= run`, its failures in `lastError`.
  void syncer.syncAll(loadConfig().repos, { full: body.full });
  return json({ status: syncer.status(), run: syncer.currentRun }, 202);
});
