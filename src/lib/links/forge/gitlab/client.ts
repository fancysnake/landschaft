export class GitlabError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitlabError";
  }
}

/** Where the instance is and the token that reads it. */
export interface GitlabAccess {
  /** With a trailing slash, so an instance under a path keeps it. */
  url: string;
  token: string;
}

/** The access `GITLAB_URL` and `GITLAB_TOKEN` give; the token needs the `read_api` scope. */
export function getAccess(env: Record<string, string | undefined> = process.env): GitlabAccess {
  const url = env.GITLAB_URL?.trim();
  const token = env.GITLAB_TOKEN?.trim();
  if (!url || !token) {
    throw new GitlabError("No GitLab access: set GITLAB_URL and GITLAB_TOKEN");
  }
  if (!URL.canParse(url)) throw new GitlabError(`GITLAB_URL is not a URL: ${url}`);
  return { url: url.endsWith("/") ? url : `${url}/`, token };
}

export interface GitlabClient {
  /** The data, and the requests the instance still allows when it says so. */
  gql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<{ data: T; rateRemaining: number | null }>;
  /** `url` as an absolute URL; GitLab gives an uploaded avatar as a path on the instance. */
  absolute(url: string): string;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Bounds every request, so a stalled GitLab cannot hang page renders or sync. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Reads `access` on every request, so an install on GitHub never needs it. */
export function createGitlabClient(
  access: () => GitlabAccess,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): GitlabClient {
  return {
    async gql<T>(query: string, variables: Record<string, unknown>) {
      const { url, token } = access();
      const response = await fetchImpl(new URL("api/graphql", url).href, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new GitlabError(`GraphQL HTTP ${response.status}: ${await response.text()}`);
      }
      const payload = (await response.json()) as { data?: T; errors?: { message: string }[] };
      if (payload.errors?.length) {
        throw new GitlabError(payload.errors.map((error) => error.message).join("; "));
      }
      if (!payload.data) throw new GitlabError("GraphQL response without data");
      const remaining = response.headers.get("ratelimit-remaining");
      return { data: payload.data, rateRemaining: remaining === null ? null : Number(remaining) };
    },
    absolute: (url) => new URL(url, access().url).href,
  };
}
