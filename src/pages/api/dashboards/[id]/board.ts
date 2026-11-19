import { NotFoundError } from "../../../../lib/pacts/services";
import { hiddenRepos } from "../../../../lib/pacts/views";
import { ViewQuerySchema } from "../../../../lib/pacts/web";
import { json, parseQuery, route } from "../../_route";

export const GET = route(
  async ({ cookies, locals, params, url }) =>
    json(
      await locals.services.views.board(
        params.id ?? "",
        parseQuery(ViewQuerySchema, url),
        hiddenRepos(cookies),
      ),
    ),
  [[NotFoundError, 404]],
);
