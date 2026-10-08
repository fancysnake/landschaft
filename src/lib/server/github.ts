import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { FetchedIssue, IssueState, LabelDef, PullStatus } from "../types";

import { PULL_STATUS_NAMES, type PullStatusLabel } from "../schema";

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

export interface GithubClient {
  gql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
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
  return {
    async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
      const response = await fetchImpl("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          authorization: `Bearer ${await token()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });
      if (!response.ok) {
        throw new GithubError(`GraphQL HTTP ${response.status}: ${await response.text()}`);
      }
      const payload = (await response.json()) as { data?: T; errors?: { message: string }[] };
      if (payload.errors?.length) {
        throw new GithubError(payload.errors.map((e) => e.message).join("; "));
      }
      if (!payload.data) throw new GithubError("GraphQL response without data");
      return payload.data;
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

const PULL_FIELDS = `
fragment PullFields on PullRequest {
  id number title state url createdAt updatedAt closedAt
  author { login }
  labels(first: 50) { nodes { name color } }
  assignees(first: 10) { nodes { login avatarUrl } }
  closingIssuesReferences(first: 20) { nodes { number repository { nameWithOwner } } }
}`;

/** No `since` filter on pullRequests: newest first, the caller stops paging past `since`. */
const PULLS_PAGE_QUERY = `
query PullsPage($owner: String!, $name: String!, $states: [PullRequestState!], $after: String) {
  rateLimit { remaining }
  repository(owner: $owner, name: $name) {
    pullRequests(first: 50, after: $after, states: $states,
                 orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes { ...PullFields }
    }
  }
}
${PULL_FIELDS}`;

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

export interface PullNode {
  id: string;
  number: number;
  title: string;
  state: IssueState | "MERGED";
  url: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  author: { login: string } | null;
  labels: { nodes: { name: string; color: string }[] };
  assignees: { nodes: { login: string; avatarUrl: string }[] };
  closingIssuesReferences: {
    nodes: { number: number; repository: { nameWithOwner: string } }[];
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

interface PullsPageData {
  rateLimit: { remaining: number };
  repository: { pullRequests: { pageInfo: PageInfo; nodes: PullNode[] } } | null;
}

interface LabelsData {
  repository: {
    labels: {
      pageInfo: PageInfo;
      nodes: { name: string; color: string; description: string | null }[];
    };
  } | null;
}

/** The fields issues and pull requests map the same way. */
function baseFields(repo: string, node: IssueNode | PullNode) {
  return {
    repo,
    number: node.number,
    nodeId: node.id,
    title: node.title,
    url: node.url,
    author: node.author?.login ?? null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    closedAt: node.closedAt,
    labels: node.labels.nodes.map((l) => ({ name: l.name, color: l.color })),
    assignees: node.assignees.nodes.map((a) => ({ login: a.login, avatarUrl: a.avatarUrl })),
  };
}

export function toIssue(repo: string, node: IssueNode): FetchedIssue {
  return {
    ...baseFields(repo, node),
    kind: "issue",
    state: node.state,
    issueType: node.issueType?.name ?? null,
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
    linked: [],
  };
}

/** A merged PR counts as closed. */
export function toPull(repo: string, node: PullNode): FetchedIssue {
  return {
    ...baseFields(repo, node),
    kind: "pr",
    state: node.state === "OPEN" ? "OPEN" : "CLOSED",
    issueType: null,
    parent: null,
    subIssues: { total: 0, completed: 0, percent: 0 },
    blockedBy: [],
    blockedByTotal: 0,
    linked: node.closingIssuesReferences.nodes.map((ref) => ({
      repo: ref.repository.nameWithOwner,
      number: ref.number,
    })),
  };
}

function splitRepo(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new GithubError(`invalid repo "${repo}", expected owner/repo`);
  return { owner, name };
}

export interface IssuesPage {
  issues: FetchedIssue[];
  hasNextPage: boolean;
  endCursor: string | null;
  rateRemaining: number;
}

/** `openOnly` fetches open items only; otherwise every state. */
export interface PageOptions {
  since: string | null;
  openOnly: boolean;
  after: string | null;
}

export async function fetchIssuesPage(
  gh: GithubClient,
  repo: string,
  options: PageOptions,
): Promise<IssuesPage> {
  const data = await gh.gql<IssuesPageData>(ISSUES_PAGE_QUERY, {
    ...splitRepo(repo),
    since: options.since,
    states: options.openOnly ? ["OPEN"] : null,
    after: options.after,
  });
  if (!data.repository) throw new GithubError(`repository ${repo} not found or not accessible`);
  const { issues } = data.repository;
  return {
    issues: issues.nodes.map((node) => toIssue(repo, node)),
    hasNextPage: issues.pageInfo.hasNextPage,
    endCursor: issues.pageInfo.endCursor,
    rateRemaining: data.rateLimit.remaining,
  };
}

/** Same contract as fetchIssuesPage; with `since`, paging ends at the first older PR. */
export async function fetchPullsPage(
  gh: GithubClient,
  repo: string,
  options: PageOptions,
): Promise<IssuesPage> {
  const data = await gh.gql<PullsPageData>(PULLS_PAGE_QUERY, {
    ...splitRepo(repo),
    states: options.openOnly ? ["OPEN"] : null,
    after: options.after,
  });
  if (!data.repository) throw new GithubError(`repository ${repo} not found or not accessible`);
  const { pageInfo, nodes } = data.repository.pullRequests;
  const since = options.since ? Date.parse(options.since) : null;
  const fresh =
    since === null ? nodes : nodes.filter((node) => Date.parse(node.updatedAt) >= since);
  return {
    issues: fresh.map((node) => toPull(repo, node)),
    hasNextPage: pageInfo.hasNextPage && fresh.length === nodes.length,
    endCursor: pageInfo.endCursor,
    rateRemaining: data.rateLimit.remaining,
  };
}

export type StatusState = "EXPECTED" | "ERROR" | "FAILURE" | "PENDING" | "SUCCESS";

/** A commit status rollup entry: a check run, or a commit status. */
export type CheckContext =
  | { type: "CheckRun"; status: string }
  | { type: "StatusContext"; state: string };

function isRunning(check: CheckContext): boolean {
  return check.type === "StatusContext"
    ? check.state === "PENDING" || check.state === "EXPECTED"
    : check.status !== "COMPLETED";
}

interface Login {
  login: string;
}

export interface PullStatusNode {
  number: number;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  author: Login | null;
  commits: {
    nodes: {
      commit: {
        statusCheckRollup: { state: StatusState; contexts: { nodes: CheckContext[] } } | null;
      };
    }[];
  };
  reviewThreads: {
    nodes: { isResolved: boolean; comments: { nodes: { author: Login | null }[] } }[];
  };
}

/** Unanswered: an unresolved review thread whose last comment is not the PR author's. */
export function toPullStatus(node: PullStatusNode): PullStatus {
  const author = node.author?.login;
  const rollup = node.commits.nodes[0]?.commit.statusCheckRollup;
  const holds: Record<PullStatusLabel, boolean> = {
    "is:conflicting": node.mergeable === "CONFLICTING",
    // The commit's red X; it stays red while other checks still run.
    "is:ci:failed": rollup?.state === "FAILURE" || rollup?.state === "ERROR",
    "is:ci:running": rollup?.contexts.nodes.some(isRunning) ?? false,
    "is:unanswered": node.reviewThreads.nodes.some(
      (thread) => !thread.isResolved && thread.comments.nodes[0]?.author?.login !== author,
    ),
  };
  return { number: node.number, statuses: PULL_STATUS_NAMES.filter((name) => holds[name]) };
}

/** PRs per status query; the caller splits the open PRs into batches this size. */
export const STATUS_BATCH = 50;

/** Each PR is its own aliased field. ponytail: first 100 checks and review threads. */
function pullStatusField(number: number): string {
  return `pr${number}: pullRequest(number: ${number}) {
    number mergeable author { login }
    commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 100) { nodes {
      type: __typename
      ... on CheckRun { status }
      ... on StatusContext { state }
    } } } } } }
    reviewThreads(first: 100) { nodes { isResolved comments(last: 1) { nodes { author { login } } } } }
  }`;
}

export interface PullStatusPage {
  statuses: PullStatus[];
  rateRemaining: number;
}

/**
 * Merge conflicts, checks and review threads of up to `STATUS_BATCH` PRs, in one
 * query. Not all of it bumps a PR's `updatedAt`, so the sync asks for every open PR each time.
 */
export async function fetchPullStatuses(
  gh: GithubClient,
  repo: string,
  numbers: number[],
): Promise<PullStatusPage> {
  const data = await gh.gql<{
    rateLimit: { remaining: number };
    repository: Record<string, PullStatusNode | null> | null;
  }>(
    `query PullStatus($owner: String!, $name: String!) {
      rateLimit { remaining }
      repository(owner: $owner, name: $name) { ${numbers.map(pullStatusField).join("\n")} }
    }`,
    splitRepo(repo),
  );
  if (!data.repository) throw new GithubError(`repository ${repo} not found or not accessible`);
  const nodes = Object.values(data.repository).filter((node) => node !== null);
  return { statuses: nodes.map(toPullStatus), rateRemaining: data.rateLimit.remaining };
}

/** Login of the account the token belongs to. */
export async function fetchViewer(gh: GithubClient): Promise<string> {
  const data = await gh.gql<{ viewer: { login: string } }>(VIEWER_QUERY, {});
  return data.viewer.login;
}

export async function fetchRepoLabels(
  gh: GithubClient,
  repo: string,
): Promise<Omit<LabelDef, "repo">[]> {
  const labels: Omit<LabelDef, "repo">[] = [];
  let after: string | null = null;
  do {
    const data: LabelsData = await gh.gql<LabelsData>(LABELS_QUERY, { ...splitRepo(repo), after });
    if (!data.repository) throw new GithubError(`repository ${repo} not found or not accessible`);
    const page = data.repository.labels;
    labels.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return labels;
}
