import { SyncRequestSchema } from "../../lib/pacts/schema";
import { SyncBusyError } from "../../lib/pacts/services";
import { ApiError, json, route } from "./_route";

export const POST = route(async ({ locals, request }) => {
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
  const { config, sync: syncer } = locals.services;
  if (body.repo) {
    try {
      const result = await syncer.syncRepo(body.repo, { full: body.full });
      return json({ results: [result], status: syncer.status() });
    } catch (error) {
      if (error instanceof SyncBusyError) throw error;
      throw new ApiError(502, error instanceof Error ? error.message : String(error));
    }
  }
  // The run ends once /api/version reports `runs >= run`, its failures in `lastError`.
  void syncer.syncAll(config.load().repos, { full: body.full });
  return json({ status: syncer.status(), run: syncer.currentRun }, 202);
});
