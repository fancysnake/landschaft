import { InvalidError, NotFoundError } from "../../../../lib/pacts/services";
import { StarEpicRequestSchema } from "../../../../lib/pacts/web";
import { json, parseBody, route } from "../../_route";

export const POST = route(
  async ({ locals, params, request }) => {
    const { epic, starred } = await parseBody(StarEpicRequestSchema, request);
    return json({ starredEpics: locals.services.views.starEpic(params.id ?? "", epic, starred) });
  },
  [
    [NotFoundError, 404],
    [InvalidError, 400],
  ],
);
