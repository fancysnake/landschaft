import { StarEpicRequestSchema } from "../../../../lib/pacts/schema";
import { json, parseBody, route } from "../../_route";

export const POST = route(async ({ locals, params, request }) => {
  const { epic, starred } = await parseBody(StarEpicRequestSchema, request);
  return json({ starredEpics: locals.services.views.starEpic(params.id ?? "", epic, starred) });
});
