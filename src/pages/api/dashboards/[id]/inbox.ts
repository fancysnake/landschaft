import { NotFoundError } from "../../../../lib/pacts/services";
import { hiddenRepos, ViewQuerySchema } from "../../../../lib/pacts/web";
import { json, parseQuery, route } from "../../_route";

export const GET = route(
  async ({ cookies, locals, params, url }) =>
    json(
      await locals.services.views.inbox(
        params.id ?? "",
        parseQuery(ViewQuerySchema, url),
        hiddenRepos(cookies),
      ),
    ),
  [[NotFoundError, 404]],
);
