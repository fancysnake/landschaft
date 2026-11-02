import { InvalidError } from "../../lib/pacts/services";
import { HiddenReposRequestSchema } from "../../lib/pacts/web";
import { json, parseBody, route } from "./_route";

export const POST = route(
  async ({ locals, request }) => {
    const { repos, hidden } = await parseBody(HiddenReposRequestSchema, request);
    return json({ hiddenRepos: locals.services.config.setHidden(repos, hidden).hiddenRepos });
  },
  [[InvalidError, 400]],
);
