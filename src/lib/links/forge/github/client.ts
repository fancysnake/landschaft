import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GithubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubError";
  }
}

export async function getToken(): Promise<string> {
  const fromEnv = process.env.GITHUB_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"]);
    const token = stdout.trim();
    if (token) return token;
  } catch {
    // fall through to the error below
  }
  throw new GithubError("No GitHub token: set GITHUB_TOKEN or run `gh auth login`");
}

export interface GqlError {
  message: string;
  type?: string;
  path?: (string | number)[];
}

export interface GqlOptions {
  /**
   * Errors next to data that it accepts are dropped and the fields they hit come back null; any
   * other error throws.
   */
  acceptError?: (error: GqlError) => boolean;
}

export interface GithubClient {
  gql<T>(query: string, variables: Record<string, unknown>, options?: GqlOptions): Promise<T>;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Bounds every request, so a stalled GitHub cannot hang page renders or sync. */
const REQUEST_TIMEOUT_MS = 30_000;

export function createGithubClient(
  tokenSource: () => Promise<string>,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): GithubClient {
  let cached: Promise<string> | null = null;
  const token = () => {
    cached ??= tokenSource().catch((error: unknown) => {
      cached = null;
      throw error;
    });
    return cached;
  };
  return {
    async gql<T>(
      query: string,
      variables: Record<string, unknown>,
      options: GqlOptions = {},
    ): Promise<T> {
      const response = await fetchImpl("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          authorization: `Bearer ${await token()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new GithubError(`GraphQL HTTP ${response.status}: ${await response.text()}`);
      }
      const payload = (await response.json()) as { data?: T; errors?: GqlError[] };
      const { acceptError } = options;
      if (
        payload.errors?.length &&
        !(acceptError && payload.data && payload.errors.every(acceptError))
      ) {
        throw new GithubError(payload.errors.map((e) => e.message).join("; "));
      }
      if (!payload.data) throw new GithubError("GraphQL response without data");
      return payload.data;
    },
  };
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export function splitRepo(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new GithubError(`invalid repo "${repo}", expected owner/repo`);
  return { owner, name };
}

export type StatusState = "EXPECTED" | "ERROR" | "FAILURE" | "PENDING" | "SUCCESS";

export interface Login {
  login: string;
}

export const isRed = (state: StatusState | undefined) => state === "FAILURE" || state === "ERROR";
