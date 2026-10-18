import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { CiJob, FetchedIssue, IssueState, LabelDef, PullStatus } from "../types";

import { PULL_STATUS_NAMES, type PullStatusLabel } from "../status";
import { ciJobKey } from "../types";

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
  /** With `partial`, errors next to data are dropped; the fields they hit come back null. */
  gql<T>(
    query: string,
    variables: Record<string, unknown>,
    options?: { partial?: boolean },
  ): Promise<T>;
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
      options: { partial?: boolean } = {},
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
      const payload = (await response.json()) as { data?: T; errors?: { message: string }[] };
      if (payload.errors?.length && !(options.partial && payload.data)) {
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

const CI_BRANCHES_QUERY = `
query CiBranches($owner: String!, $name: String!, $after: String) {
  rateLimit { remaining }
  repository(owner: $owner, name: $name) {
    refs(refPrefix: "refs/heads/", first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { name target { ... on Commit { statusCheckRollup { state } } } }
    }
  }
}`;

interface CiBranchesData {
  rateLimit: { remaining: number };
  repository: {
    refs: {
      pageInfo: PageInfo;
      nodes: { name: string; target: { statusCheckRollup?: { state: StatusState } | null } }[];
    };
  } | null;
}

export interface FailingBranchesPage {
  branches: string[];
  hasNextPage: boolean;
  endCursor: string | null;
  rateRemaining: number;
}

const isRed = (state: StatusState | undefined) => state === "FAILURE" || state === "ERROR";

/** Branches whose head commit has the red X; reads no commit history, so a page costs 1 point. */
export async function fetchFailingBranchesPage(
  gh: GithubClient,
  repo: string,
  after: string | null,
): Promise<FailingBranchesPage> {
  const data = await gh.gql<CiBranchesData>(CI_BRANCHES_QUERY, { ...splitRepo(repo), after });
  if (!data.repository) throw new GithubError(`repository ${repo} not found or not accessible`);
  const { pageInfo, nodes } = data.repository.refs;
  return {
    branches: nodes
      .filter((ref) => isRed(ref.target.statusCheckRollup?.state))
      .map((ref) => ref.name),
    hasNextPage: pageInfo.hasNextPage,
    endCursor: pageInfo.endCursor,
    rateRemaining: data.rateLimit.remaining,
  };
}

/** A cancelled, skipped or neutral job is no failure. */
const FAILED_CONCLUSIONS = new Set(["FAILURE", "TIMED_OUT", "STARTUP_FAILURE"]);

export type CiContext =
  | {
      type: "CheckRun";
      name: string;
      conclusion: string | null;
      detailsUrl: string | null;
      url: string;
      completedAt: string | null;
      checkSuite: { workflowRun: { workflow: { name: string } } | null };
    }
  | {
      type: "StatusContext";
      context: string;
      state: StatusState;
      targetUrl: string | null;
      createdAt: string;
    };

interface CommitAuthors {
  nodes: { author: { user: Login | null } | null }[];
}

export interface CiBranchNode {
  associatedPullRequests: { nodes: { number: number; url: string }[] };
  target: {
    url: string;
    history: CommitAuthors;
    statusCheckRollup: { contexts: { nodes: CiContext[] } } | null;
  };
}

/** The default branch compared with a branch; null without a merge base. */
export interface CompareNode {
  aheadBy: number;
  commits: CommitAuthors;
}

/** Logins behind `commits`, without the `[bot]` suffix that issue authors lack too. */
const loginsOf = (commits: CommitAuthors): string[] => [
  ...new Set(
    commits.nodes.flatMap(({ author }) =>
      author?.user ? [author.user.login.replace(/\[bot\]$/i, "")] : [],
    ),
  ),
];

/**
 * The failed jobs on `branch`'s head commit. The rollup holds the newest run of each job there.
 * shortcut: a job that skipped the head commit (path filters) hides its failure on an earlier
 * one; query each job's run history if that bites.
 */
export function toCiJobs(
  repo: string,
  branch: string,
  node: CiBranchNode,
  compare: CompareNode | null,
): CiJob[] {
  const { target } = node;
  const ahead = compare !== null && compare.aheadBy > 0;
  const authors = loginsOf(ahead ? compare.commits : target.history);
  const pr = node.associatedPullRequests.nodes[0] ?? null;
  const jobs = (target.statusCheckRollup?.contexts.nodes ?? []).flatMap((check): CiJob[] => {
    const job = { repo, branch, authors, pr };
    if (check.type === "CheckRun") {
      if (!FAILED_CONCLUSIONS.has(check.conclusion ?? "")) return [];
      return [
        {
          ...job,
          workflow: check.checkSuite.workflowRun?.workflow.name ?? null,
          name: check.name,
          url: check.detailsUrl ?? check.url,
          failedAt: check.completedAt ?? "",
        },
      ];
    }
    if (check.state !== "FAILURE" && check.state !== "ERROR") return [];
    return [
      {
        ...job,
        workflow: null,
        name: check.context,
        url: check.targetUrl ?? target.url,
        failedAt: check.createdAt,
      },
    ];
  });
  // An app can report one job as a check run and as a commit status alike.
  const keys = jobs.map(ciJobKey);
  return jobs.filter((_, index) => keys.indexOf(keys[index]!) === index);
}

/** Branches per CI job query. */
export const CI_BATCH = 20;

const AUTHORS = "nodes { author { user { login } } }";

/** Branch `index`'s head commit, and the default branch compared with it, as aliased fields. */
function ciBranchFields(index: number): string {
  return `b${index}: ref(qualifiedName: $ref${index}) {
    associatedPullRequests(states: OPEN, first: 1) { nodes { number url } }
    target { ... on Commit {
      url
      history(first: 3) { ${AUTHORS} }
      statusCheckRollup { contexts(first: 100) { nodes {
        type: __typename
        ... on CheckRun { name conclusion detailsUrl url completedAt
          checkSuite { workflowRun { workflow { name } } } }
        ... on StatusContext { context state targetUrl createdAt }
      } } }
    } }
  }
  c${index}: defaultBranchRef { compare(headRef: $branch${index}) {
    aheadBy commits(first: 100) { ${AUTHORS} }
  } }`;
}

export interface CiJobsPage {
  jobs: CiJob[];
  rateRemaining: number;
}

/**
 * The failed jobs on up to `CI_BATCH` branches, in one query. A branch deleted since it was
 * listed is skipped; one without a merge base gets no comparison, both as errors next to data.
 * shortcut: the first 100 commits ahead and checks per branch.
 */
export async function fetchCiJobs(
  gh: GithubClient,
  repo: string,
  branches: string[],
): Promise<CiJobsPage> {
  const params = branches.map((_, i) => `$ref${i}: String!, $branch${i}: String!`).join(", ");
  const variables = Object.fromEntries(
    branches.flatMap((branch, i) => [
      [`ref${i}`, `refs/heads/${branch}`],
      [`branch${i}`, branch],
    ]),
  );
  const data = await gh.gql<{
    rateLimit: { remaining: number };
    repository: Record<string, CiBranchNode | { compare: CompareNode | null } | null> | null;
  }>(
    `query CiJobs($owner: String!, $name: String!, ${params}) {
      rateLimit { remaining }
      repository(owner: $owner, name: $name) { ${branches.map((_, i) => ciBranchFields(i)).join("\n")} }
    }`,
    { ...splitRepo(repo), ...variables },
    { partial: true },
  );
  if (!data.repository) throw new GithubError(`repository ${repo} not found or not accessible`);
  const fields = data.repository;
  const jobs = branches.flatMap((branch, i) => {
    const node = fields[`b${i}`] as CiBranchNode | null | undefined;
    const compare = (fields[`c${i}`] as { compare: CompareNode | null } | null | undefined)
      ?.compare;
    return node ? toCiJobs(repo, branch, node, compare ?? null) : [];
  });
  return { jobs, rateRemaining: data.rateLimit.remaining };
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
