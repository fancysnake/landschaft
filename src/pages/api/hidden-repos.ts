import { HiddenReposRequestSchema } from "../../lib/pacts/schema";
import { json, parseBody, route } from "./_route";

export const POST = route(async ({ locals, request }) => {
  const { repos, hidden } = await parseBody(HiddenReposRequestSchema, request);
  return json({ hiddenRepos: locals.services.config.setHidden(repos, hidden).hiddenRepos });
});
