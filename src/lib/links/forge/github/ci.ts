import type { CiJob } from "../../../pacts/types";

import { ciJobKey } from "../../../pacts/types";
import {
  type GithubClient,
  GithubError,
  type GqlError,
  isRed,
  type Login,
  type PageInfo,
  splitRepo,
  type StatusState,
} from "./client";

const CI_BRANCHES_QUERY = `
query CiBranches($owner: String!, $name: String!, $after: String) {
  rateLimit { remaining }
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name }
    refs(refPrefix: "refs/heads/", first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { name target { ... on Commit { statusCheckRollup { state } } } }
    }
  }
}`;

interface CiBranchesData {
  rateLimit: { remaining: number };
  repository: {
    defaultBranchRef: { name: string } | null;
    refs: {
      pageInfo: PageInfo;
      nodes: { name: string; target: { statusCheckRollup?: { state: StatusState } | null } }[];
    };
  } | null;
}

/** A branch to read failed jobs of; `suites` also reads its head commit's check suites. */
export interface CiBranch {
  name: string;
  suites: boolean;
}

export interface CiBranchesPage {
  branches: CiBranch[];
  hasNextPage: boolean;
  endCursor: string | null;
  rateRemaining: number;
}

/**
 * Branches whose head commit has the red X, plus the default branch with its check suites, which
 * hold the scheduled and dispatched runs the red X leaves out; reads no commit history, so a page
 * costs 1 point.
 */
export async function fetchCiBranchesPage(
  gh: GithubClient,
  repo: string,
  after: string | null,
): Promise<CiBranchesPage> {
  const data = await gh.gql<CiBranchesData>(CI_BRANCHES_QUERY, { ...splitRepo(repo), after });
  if (!data.repository) throw new GithubError(`repository ${repo} not found or not accessible`);
  const { pageInfo, nodes } = data.repository.refs;
  const defaultBranch = data.repository.defaultBranchRef?.name ?? null;
  return {
    branches: nodes.flatMap(({ name, target }) => {
      const suites = name === defaultBranch;
      return suites || isRed(target.statusCheckRollup?.state) ? [{ name, suites }] : [];
    }),
    hasNextPage: pageInfo.hasNextPage,
    endCursor: pageInfo.endCursor,
    rateRemaining: data.rateLimit.remaining,
  };
}

/** `url` when it is http(s); apps and status posters set it, and it lands in an href. */
function webUrl(url: string | null): string | null {
  return url !== null && /^https?:\/\//i.test(url) ? url : null;
}

/** A cancelled, skipped or neutral job is no failure. */
const FAILED_CONCLUSIONS = new Set(["FAILURE", "TIMED_OUT", "STARTUP_FAILURE"]);

export interface CheckRunContext {
  type: "CheckRun";
  name: string;
  conclusion: string | null;
  detailsUrl: string | null;
  url: string;
  startedAt: string | null;
  completedAt: string | null;
  checkSuite: { workflowRun: { workflow: { name: string } } | null };
}

export type CiContext =
  | CheckRunContext
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
  mergedPullRequests: { nodes: { headRefOid: string }[] };
  target: {
    oid: string;
    url: string;
    history: CommitAuthors;
    statusCheckRollup: { contexts: { nodes: CiContext[] } } | null;
    /** With `suites` alone: the suites of scheduled and dispatched runs, which the rollup lacks. */
    checkSuites?: { nodes: { checkRuns: { nodes: CheckRunContext[] } }[] };
  };
}

/** The default branch compared with a branch; null without a merge base. */
export interface CompareNode {
  aheadBy: number;
  commits: CommitAuthors;
}

export interface DefaultBranchNode {
  name: string;
  compare: CompareNode | null;
}

/** Logins behind `commits`, without the `[bot]` suffix that issue authors lack too. */
const loginsOf = (commits: CommitAuthors): string[] => [
  ...new Set(
    commits.nodes.flatMap(({ author }) =>
      author?.user ? [author.user.login.replace(/\[bot\]$/i, "")] : [],
    ),
  ),
];

/** One rollup entry as a run of its job: whether it failed, when it started, and what it ran. */
interface Run {
  failed: boolean;
  at: string;
  job: CiJob;
}

/** What every job on a branch's head commit shares. */
type HeadOf = Pick<CiJob, "repo" | "branch" | "authors" | "pr">;

/**
 * `check` as a run on the head commit at `commitUrl`; null for a check run that has not
 * finished.
 */
function runOf(check: CiContext, commitUrl: string, head: HeadOf): Run | null {
  if (check.type === "StatusContext") {
    return {
      failed: isRed(check.state),
      at: check.createdAt,
      job: {
        ...head,
        workflow: null,
        name: check.context,
        url: webUrl(check.targetUrl) ?? commitUrl,
        failedAt: check.createdAt,
      },
    };
  }
  const { startedAt, completedAt } = check;
  if (startedAt === null || completedAt === null) return null;
  return {
    failed: FAILED_CONCLUSIONS.has(check.conclusion ?? ""),
    at: startedAt,
    job: {
      ...head,
      workflow: check.checkSuite.workflowRun?.workflow.name ?? null,
      name: check.name,
      url: webUrl(check.detailsUrl) ?? check.url,
      failedAt: completedAt,
    },
  };
}

/**
 * The failed jobs on `branch`'s head commit, none once it is merged. The rollup holds a run per
 * check suite, so a job re-run in another suite appears more than once; only its newest finished
 * run counts.
 * shortcut: a job that skipped the head commit (path filters) hides its failure on an earlier
 * one; query each job's run history if that bites.
 */
export function toCiJobs(
  repo: string,
  branch: string,
  node: CiBranchNode,
  base: DefaultBranchNode | null,
): CiJob[] {
  const { target } = node;
  const compare = base?.name === branch ? null : (base?.compare ?? null);
  // Merged: its head is the newest merged PR's, or the default branch holds all of it.
  if (node.mergedPullRequests.nodes[0]?.headRefOid === target.oid || compare?.aheadBy === 0)
    return [];
  const head: HeadOf = {
    repo,
    branch,
    authors: loginsOf(compare ? compare.commits : target.history),
    pr: node.associatedPullRequests.nodes[0] ?? null,
  };
  // Also merges a job an app reports as a check run and as a commit status alike.
  const newest = new Map<string, Run>();
  const suiteRuns = target.checkSuites?.nodes.flatMap((suite) => suite.checkRuns.nodes) ?? [];
  for (const check of [...(target.statusCheckRollup?.contexts.nodes ?? []), ...suiteRuns]) {
    const run = runOf(check, target.url, head);
    if (!run) continue;
    const key = ciJobKey(run.job);
    const seen = newest.get(key);
    if (!seen || run.at > seen.at) newest.set(key, run);
  }
  return [...newest.values()].filter((run) => run.failed).map((run) => run.job);
}

/** Branches per CI job query. */
export const CI_BATCH = 20;

const AUTHORS = "nodes { author { user { login } } }";

/** The aliases of branch `index`'s head commit and comparison fields in the CI job query. */
const aliasesOf = (index: number) => ({ branch: `b${index}`, compare: `c${index}` }) as const;

const CHECK_RUN = `... on CheckRun { name conclusion detailsUrl url startedAt completedAt
  checkSuite { workflowRun { workflow { name } } } }`;

/**
 * Branch `index`'s head commit, and the default branch compared with it, as aliased fields;
 * with `suites`, also the commit's check suites.
 * shortcut: the newest 50 suites, 50 runs each; raise if a busy commit pushes a scheduled run out.
 */
function ciBranchFields(index: number, suites: boolean): string {
  const aliases = aliasesOf(index);
  const checkSuites = suites
    ? `checkSuites(last: 50) { nodes { checkRuns(first: 50) { nodes { type: __typename ${CHECK_RUN} } } } }`
    : "";
  return `${aliases.branch}: ref(qualifiedName: $ref${index}) {
    associatedPullRequests(states: OPEN, first: 1) { nodes { number url } }
    mergedPullRequests: associatedPullRequests(
      states: MERGED, first: 1, orderBy: { field: CREATED_AT, direction: DESC }
    ) { nodes { headRefOid } }
    target { ... on Commit {
      oid
      url
      history(first: 3) { ${AUTHORS} }
      statusCheckRollup { contexts(first: 100) { nodes {
        type: __typename
        ${CHECK_RUN}
        ... on StatusContext { context state targetUrl createdAt }
      } } }
      ${checkSuites}
    } }
  }
  ${aliases.compare}: defaultBranchRef { name compare(headRef: $branch${index}) {
    aheadBy commits(first: 100) { ${AUTHORS} }
  } }`;
}

export interface CiJobsPage {
  jobs: CiJob[];
  /** Branches an unexpected error hit, whose cached jobs still hold. */
  failed: string[];
  rateRemaining: number;
}

/**
 * The branches `error` leaves without jobs to trust. `NOT_FOUND` on a branch's ref, or on the
 * ref it is compared with, means that ref is gone since it was listed, which nulls the field and
 * leaves the rest sound; any other error, or one deeper in the field, may leave it partial, so it
 * fails the branch whose field it hit, or all of them.
 */
function failedBy(error: GqlError, branches: CiBranch[]): CiBranch[] {
  const [, field, ...nested] = error.path ?? [];
  const hit = branches.filter((_, i) => {
    const aliases = aliasesOf(i);
    return field === aliases.branch || field === aliases.compare;
  });
  if (hit.length === 0) return branches;
  const refAt = String(field).startsWith("b") ? "" : "compare";
  return error.type === "NOT_FOUND" && nested.join(".") === refAt ? [] : hit;
}

/**
 * The failed jobs on up to `CI_BATCH` branches, in one query. A branch deleted since it was
 * listed is skipped, and one whose comparison ref is gone gets none; a branch any other error hit
 * is `failed`, so the sync keeps its cached jobs.
 * shortcut: the first 100 commits ahead and checks per branch.
 */
export async function fetchCiJobs(
  gh: GithubClient,
  repo: string,
  branches: CiBranch[],
): Promise<CiJobsPage> {
  const params = branches.map((_, i) => `$ref${i}: String!, $branch${i}: String!`).join(", ");
  const variables = Object.fromEntries(
    branches.flatMap(({ name }, i) => [
      [`ref${i}`, `refs/heads/${name}`],
      [`branch${i}`, name],
    ]),
  );
  const failed = new Set<string>();
  const data = await gh.gql<{
    rateLimit: { remaining: number };
    repository:
      | (Record<`b${number}`, CiBranchNode | null> & Record<`c${number}`, DefaultBranchNode | null>)
      | null;
  }>(
    `query CiJobs($owner: String!, $name: String!, ${params}) {
      rateLimit { remaining }
      repository(owner: $owner, name: $name) { ${branches.map((branch, i) => ciBranchFields(i, branch.suites)).join("\n")} }
    }`,
    { ...splitRepo(repo), ...variables },
    {
      acceptError: (error) => {
        for (const { name } of failedBy(error, branches)) failed.add(name);
        return true;
      },
    },
  );
  if (!data.repository) throw new GithubError(`repository ${repo} not found or not accessible`);
  const fields = data.repository;
  const jobs = branches.flatMap(({ name }, i) => {
    const aliases = aliasesOf(i);
    const node = fields[aliases.branch];
    return node && !failed.has(name)
      ? toCiJobs(repo, name, node, fields[aliases.compare] ?? null)
      : [];
  });
  return { jobs, failed: [...failed], rateRemaining: data.rateLimit.remaining };
}
