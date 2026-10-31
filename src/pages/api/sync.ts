import { SyncRequestSchema } from "../../lib/pacts/schema";
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
  const configured = config.load().repos;
  const unknown = body.repos?.filter((repo) => !configured.includes(repo)) ?? [];
  if (unknown.length > 0) throw new ApiError(400, `not configured: ${unknown.join(", ")}`);
  // The run ends once /api/version reports `runs >= run`, its failures in `lastError`.
  void syncer.syncAll(body.repos ?? configured, { full: body.full });
  return json({ status: syncer.status(), run: syncer.currentRun }, 202);
});
