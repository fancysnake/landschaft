import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Issue, IssueState, LabelDef } from "../types";

const execFileAsync = promisify(execFile);

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
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

export interface GithubClient {
  gql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
  rest<T>(method: string, path: string, body?: unknown): Promise<T | null>;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

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
  const headers = async () => ({
    authorization: `Bearer ${await token()}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": API_VERSION,
    "content-type": "application/json",
  });

  return {
    async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
      const response = await fetchImpl(`${API}/graphql`, {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ query, variables }),
      });
      if (!response.ok) {
        throw new GithubError(
          `GraphQL HTTP ${response.status}: ${await response.text()}`,
          response.status,
        );
      }
      const payload = (await response.json()) as { data?: T; errors?: { message: string }[] };
      if (payload.errors?.length) {
        throw new GithubError(payload.errors.map((e) => e.message).join("; "));
      }
      if (!payload.data) throw new GithubError("GraphQL response without data");
      return payload.data;
    },

    async rest<T>(method: string, path: string, body?: unknown): Promise<T | null> {
      const response = await fetchImpl(`${API}${path}`, {
        method,
        headers: await headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        throw new GithubError(
          `${method} ${path}: HTTP ${response.status}: ${await response.text()}`,
          response.status,
        );
      }
      if (response.status === 204) return null;
      return (await response.json()) as T;
    },
  };
}

const ISSUE_FIELDS = `
fragment IssueFields on Issue {
  id number title state url createdAt updatedAt closedAt
  issueType { name }
  author { login }
  labels(first: 50) { nodes { name color } }
  assignees(first: 10) { nodes { login avatarUrl } }
  parent { number repository { nameWithOwner } }
  subIssuesSummary { total completed percentCompleted }
  issueDependenciesSummary { totalBlockedBy }
  blockedBy(first: 20) { nodes { number state repository { nameWithOwner } } }
}`;

const ISSUES_PAGE_QUERY = `
query IssuesPage($owner: String!, $name: String!, $since: DateTime, $states: [IssueState!], $after: String) {
  rateLimit { remaining }
  repository(owner: $owner, name: $name) {
    issues(first: 50, after: $after, filterBy: { since: $since, states: $states },
           orderBy: { field: UPDATED_AT, direction: ASC }) {
      pageInfo { hasNextPage endCursor }
      nodes { ...IssueFields }
    }
  }
}
${ISSUE_FIELDS}`;

const ISSUE_QUERY = `
query Issue($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { issue(number: $number) { ...IssueFields } }
}
${ISSUE_FIELDS}`;

const VIEWER_QUERY = `query Viewer { viewer { login } }`;

const LABELS_QUERY = `
query Labels($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    labels(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { name color description }
    }
  }
}`;

export interface IssueNode {
  id: string;
  number: number;
  title: string;
  state: IssueState;
  url: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  issueType: { name: string } | null;
  author: { login: string } | null;
  labels: { nodes: { name: string; color: string }[] };
  assignees: { nodes: { login: string; avatarUrl: string }[] };
  parent: { number: number; repository: { nameWithOwner: string } } | null;
  subIssuesSummary: { total: number; completed: number; percentCompleted: number };
  issueDependenciesSummary: { totalBlockedBy: number };
  blockedBy: {
    nodes: { number: number; state: IssueState; repository: { nameWithOwner: string } }[];
  };
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface IssuesPageData {
  rateLimit: { remaining: number };
  repository: { issues: { pageInfo: PageInfo; nodes: IssueNode[] } } | null;
}

interface IssueData {
  repository: { issue: IssueNode | null } | null;
}

interface LabelsData {
  repository: {
    labels: {
      pageInfo: PageInfo;
      nodes: { name: string; color: string; description: string | null }[];
    };
  } | null;
}

export function toIssue(repo: string, node: IssueNode): Issue {
  return {
    repo,
    number: node.number,
    nodeId: node.id,
    title: node.title,
    state: node.state,
    url: node.url,
    issueType: node.issueType?.name ?? null,
    author: node.author?.login ?? null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    closedAt: node.closedAt,
    labels: node.labels.nodes.map((l) => ({ name: l.name, color: l.color })),
    assignees: node.assignees.nodes.map((a) => ({ login: a.login, avatarUrl: a.avatarUrl })),
    parent: node.parent
      ? { repo: node.parent.repository.nameWithOwner, number: node.parent.number }
      : null,
    subIssues: {
      total: node.subIssuesSummary.total,
      completed: node.subIssuesSummary.completed,
      percent: node.subIssuesSummary.percentCompleted,
    },
    blockedBy: node.blockedBy.nodes.map((b) => ({
      repo: b.repository.nameWithOwner,
      number: b.number,
      state: b.state,
    })),
    blockedByTotal: node.issueDependenciesSummary.totalBlockedBy,
  };
}

function splitRepo(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new GithubError(`invalid repo "${repo}", expected owner/repo`);
  return { owner, name };
}

export interface IssuesPage {
  issues: Issue[];
  hasNextPage: boolean;
  endCursor: string | null;
  rateRemaining: number;
}

export async function fetchIssuesPage(
  gh: GithubClient,
  repo: string,
  options: { since: string | null; states: IssueState[] | null; after: string | null },
): Promise<IssuesPage> {
  const data = await gh.gql<IssuesPageData>(ISSUES_PAGE_QUERY, { ...splitRepo(repo), ...options });
  if (!data.repository)
    throw new GithubError(`repository ${repo} not found or not accessible`, 404);
  const { issues } = data.repository;
  return {
    issues: issues.nodes.map((node) => toIssue(repo, node)),
    hasNextPage: issues.pageInfo.hasNextPage,
    endCursor: issues.pageInfo.endCursor,
    rateRemaining: data.rateLimit.remaining,
  };
}

/** Login of the account the token belongs to. */
export async function fetchViewer(gh: GithubClient): Promise<string> {
  const data = await gh.gql<{ viewer: { login: string } }>(VIEWER_QUERY, {});
  return data.viewer.login;
}

export async function fetchIssue(
  gh: GithubClient,
  repo: string,
  number: number,
): Promise<Issue | null> {
  const data = await gh.gql<IssueData>(ISSUE_QUERY, { ...splitRepo(repo), number });
  const node = data.repository?.issue;
  return node ? toIssue(repo, node) : null;
}

export async function fetchRepoLabels(
  gh: GithubClient,
  repo: string,
): Promise<Omit<LabelDef, "repo">[]> {
  const labels: Omit<LabelDef, "repo">[] = [];
  let after: string | null = null;
  do {
    const data: LabelsData = await gh.gql<LabelsData>(LABELS_QUERY, { ...splitRepo(repo), after });
    if (!data.repository)
      throw new GithubError(`repository ${repo} not found or not accessible`, 404);
    const page = data.repository.labels;
    labels.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return labels;
}

export async function addLabels(
  gh: GithubClient,
  repo: string,
  number: number,
  labels: string[],
): Promise<void> {
  if (labels.length === 0) return;
  await gh.rest("POST", `/repos/${repo}/issues/${number}/labels`, { labels });
}

export async function removeLabel(
  gh: GithubClient,
  repo: string,
  number: number,
  label: string,
): Promise<void> {
  try {
    await gh.rest("DELETE", `/repos/${repo}/issues/${number}/labels/${encodeURIComponent(label)}`);
  } catch (error) {
    // Already gone remotely: the end state is what we wanted.
    if (error instanceof GithubError && error.status === 404) return;
    throw error;
  }
}
