import { hiddenRepos } from "../../lib/pacts/views";
import { json, route } from "./_route";

export const GET = route(async ({ cookies, locals }) =>
  json(await locals.services.views.nav(hiddenRepos(cookies))),
);
