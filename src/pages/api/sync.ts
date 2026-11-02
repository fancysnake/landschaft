import { InvalidError } from "../../lib/pacts/services";
import { SyncRequestSchema } from "../../lib/pacts/web";
import { ApiError, json, route } from "./_route";

export const POST = route(
  async ({ locals, request }) => {
    const text = await request.text();
    let raw: unknown = {};
    if (text.trim()) {
      try {
        raw = JSON.parse(text);
      } catch {
        throw new ApiError(400, "invalid JSON body");
      }
    }
    const { repos, full } = SyncRequestSchema.parse(raw);
    const { sync } = locals.services;
    const run = sync.start(repos, { full });
    // The run ends once /api/version reports `runs >= run`, its failures in `lastError`.
    return json({ status: sync.status(), run }, 202);
  },
  [[InvalidError, 400]],
);
