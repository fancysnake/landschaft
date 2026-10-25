import { UnmatchedQuerySchema } from "../../lib/pacts/schema";
import { json, parseQuery, route } from "./_route";

export const GET = route(async ({ locals, url }) =>
  json(await locals.services.views.unmatched(parseQuery(UnmatchedQuerySchema, url))),
);
