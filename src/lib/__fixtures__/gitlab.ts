import { createGitlabClient } from "../links/forge/gitlab/client";

export const GITLAB_URL = "https://git.example.com/";

/** A GitLab client answering its requests with `bodies` in turn, recording each request. */
export function fakeGitlab(...bodies: { data?: unknown; errors?: { message: string }[] }[]) {
  const requests: { url: string; query: string; variables: Record<string, unknown> }[] = [];
  const gitlab = createGitlabClient(
    () => ({ url: GITLAB_URL, token: "tok" }),
    async (url, init) => {
      requests.push({
        url,
        ...(JSON.parse(init.body as string) as object),
      } as (typeof requests)[number]);
      if (requests.length > bodies.length) {
        throw new Error(
          `fakeGitlab: request ${requests.length} but only ${bodies.length} bodies supplied`,
        );
      }
      return Response.json(bodies[requests.length - 1], {
        headers: { "ratelimit-remaining": "480" },
      });
    },
  );
  return { gitlab, requests };
}
