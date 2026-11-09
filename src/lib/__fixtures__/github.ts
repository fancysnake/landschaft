import { createGithubClient, type GqlError } from "../links/forge/github/client";

/** A GraphQL response body. */
export interface GqlBody {
  data?: unknown;
  errors?: GqlError[];
}

/** A GitHub client answering its requests with `bodies` in turn, recording each request. */
export function fakeGithub(...bodies: GqlBody[]) {
  const requests: { query: string; variables: Record<string, unknown> }[] = [];
  const gh = createGithubClient(
    async () => "tok",
    async (_, init) => {
      requests.push(JSON.parse(init.body as string) as (typeof requests)[number]);
      return Response.json(bodies[requests.length - 1]);
    },
  );
  return { gh, requests };
}
