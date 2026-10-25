import { ViewQuerySchema } from "../../../../lib/pacts/schema";
import { json, parseQuery, route } from "../../_route";

export const GET = route(async ({ locals, params, url }) =>
  json(await locals.services.views.board(params.id ?? "", parseQuery(ViewQuerySchema, url))),
);
