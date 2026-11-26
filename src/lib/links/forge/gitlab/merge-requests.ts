import type { IssuesPage, PageOptions, PullStatusPage } from "../../../pacts/forge";
import type { FetchedIssue, LabelDef, PullStatus } from "../../../pacts/issues";
import type { PageInfo } from "../page";

import { PULL_STATUS_NAMES, type PullStatusLabel } from "../../../pacts/status";
import { type GitlabClient, GitlabError } from "./client";

interface User {
  username: string;
}

/** `locked` is a merge request in the middle of its merge. */
type State = "opened" | "locked" | "closed" | "merged";

export interface MergeRequestNode {
  id: string;
  iid: string;
  title: string;
  state: State;
  webUrl: string | null;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  author: User | null;
  labels: { nodes: { title: string; color: string }[] };
  assignees: { nodes: { username: string; avatarUrl: string | null }[] };
  reviewers: { nodes: User[] };
}

const MERGE_REQUESTS_QUERY = `
query MergeRequests($path: ID!, $state: MergeRequestState, $updatedAfter: Time, $after: String) {
  project(fullPath: $path) {
    mergeRequests(first: 50, after: $after, state: $state, updatedAfter: $updatedAfter,
                  sort: UPDATED_ASC) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id iid title state webUrl createdAt updatedAt mergedAt closedAt
        author { username }
        labels(first: 50) { nodes { title color } }
        assignees(first: 10) { nodes { username avatarUrl } }
        reviewers(first: 20) { nodes { username } }
      }
    }
  }
}`;

/** GitLab gives a colour as `#rrggbb`; the cache holds hex without the `#`. */
const hex = (color: string) => color.replace(/^#/, "");

const isClosed = (state: State) => state === "closed" || state === "merged";

/** A merged merge request counts as closed, at the time it merged. */
export function toPull(gitlab: GitlabClient, repo: string, node: MergeRequestNode): FetchedIssue {
  const closed = isClosed(node.state);
  return {
    kind: "pr",
    repo,
    number: Number(node.iid),
    nodeId: node.id,
    title: node.title,
    state: closed ? "CLOSED" : "OPEN",
    url: node.webUrl ?? gitlab.absolute(`${repo}/-/merge_requests/${node.iid}`),
    issueType: null,
    author: node.author?.username ?? null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    closedAt: closed ? (node.mergedAt ?? node.closedAt ?? node.updatedAt) : null,
    labels: node.labels.nodes.map((label) => ({ name: label.title, color: hex(label.color) })),
    assignees: node.assignees.nodes.map((user) => ({
      login: user.username,
      avatarUrl: user.avatarUrl === null ? "" : gitlab.absolute(user.avatarUrl),
    })),
    parent: null,
    subIssues: { total: 0, completed: 0, percent: 0 },
    blockedBy: [],
    blockedByTotal: 0,
    linked: [],
    reviewers: node.reviewers.nodes.map((user) => user.username),
  };
}

/** The project of a response, which is null for a path the token cannot read. */
function found<T>(repo: string, project: T | null): T {
  if (!project) throw new GitlabError(`project ${repo} not found or not accessible`);
  return project;
}

/**
 * Same contract as the forge's `pullsPage`. GitLab has no state for closed and merged together,
 * so a `closed` page asks for every state and drops the open ones.
 */
export async function fetchMergeRequestsPage(
  gitlab: GitlabClient,
  repo: string,
  options: PageOptions,
): Promise<IssuesPage> {
  const { data, rateRemaining } = await gitlab.gql<{
    project: { mergeRequests: { pageInfo: PageInfo; nodes: MergeRequestNode[] } } | null;
  }>(MERGE_REQUESTS_QUERY, {
    path: repo,
    state: options.states === "open" ? "opened" : "all",
    updatedAfter: options.since,
    after: options.after,
  });
  const { pageInfo, nodes } = found(repo, data.project).mergeRequests;
  const wanted = options.states === "closed" ? nodes.filter((node) => isClosed(node.state)) : nodes;
  return {
    issues: wanted.map((node) => toPull(gitlab, repo, node)),
    hasNextPage: pageInfo.hasNextPage,
    endCursor: pageInfo.endCursor,
    rateRemaining,
  };
}

type PipelineStatus =
  | "CREATED"
  | "WAITING_FOR_RESOURCE"
  | "PREPARING"
  | "WAITING_FOR_CALLBACK"
  | "PENDING"
  | "RUNNING"
  | "FAILED"
  | "SUCCESS"
  | "CANCELING"
  | "CANCELED"
  | "SKIPPED"
  | "MANUAL"
  | "SCHEDULED";

/** A pipeline on its way to a result; one that waits for a person or a schedule is not. */
const RUNNING: ReadonlySet<PipelineStatus> = new Set([
  "CREATED",
  "WAITING_FOR_RESOURCE",
  "PREPARING",
  "WAITING_FOR_CALLBACK",
  "PENDING",
  "RUNNING",
]);

export type ReviewState =
  | "UNREVIEWED"
  | "REVIEWED"
  | "REQUESTED_CHANGES"
  | "APPROVED"
  | "UNAPPROVED"
  | "REVIEW_STARTED";

export interface StatusNode {
  iid: string;
  draft: boolean;
  conflicts: boolean;
  approved: boolean;
  author: User | null;
  headPipeline: { status: PipelineStatus } | null;
  reviewers: { nodes: { mergeRequestInteraction: { reviewState: ReviewState | null } | null }[] };
  discussions: {
    nodes: {
      resolvable: boolean;
      resolved: boolean;
      notes: { nodes: { author: User | null }[] };
    }[];
  };
}

// shortcut: reads the first 100 discussions, so `is:unanswered` misses a thread past them; page
// the discussions if a merge request that long shows up.
const STATUSES_QUERY = `
query MergeRequestStatuses($path: ID!, $iids: [String!]) {
  project(fullPath: $path) {
    mergeRequests(iids: $iids, first: 50) {
      nodes {
        iid draft conflicts approved
        author { username }
        headPipeline { status }
        reviewers(first: 20) { nodes { mergeRequestInteraction { reviewState } } }
        discussions(first: 100) {
          nodes { resolvable resolved notes(last: 1) { nodes { author { username } } } }
        }
      }
    }
  }
}`;

/**
 * Unanswered: an unresolved thread whose last note is not the author's. A reviewer who asked
 * for changes outweighs the approvals, as on GitHub.
 */
export function toPullStatus(node: StatusNode): PullStatus {
  const author = node.author?.username;
  const pipeline = node.headPipeline?.status;
  const changesRequested = node.reviewers.nodes.some(
    (reviewer) => reviewer.mergeRequestInteraction?.reviewState === "REQUESTED_CHANGES",
  );
  const holds: Record<PullStatusLabel, boolean> = {
    "is:conflicting": node.conflicts,
    "is:ci:failed": pipeline === "FAILED",
    "is:ci:running": pipeline !== undefined && RUNNING.has(pipeline),
    "is:unanswered": node.discussions.nodes.some(
      (thread) =>
        thread.resolvable && !thread.resolved && thread.notes.nodes[0]?.author?.username !== author,
    ),
    "is:draft": node.draft,
    "is:approved": node.approved && !changesRequested,
    "is:changes-requested": changesRequested,
  };
  return { number: Number(node.iid), statuses: PULL_STATUS_NAMES.filter((name) => holds[name]) };
}

/**
 * Conflicts, pipeline, reviews and threads of the merge requests, in one query; the caller
 * bounds how many. A pipeline does not bump `updatedAt`, so the sync asks for every open one.
 */
export async function fetchStatuses(
  gitlab: GitlabClient,
  repo: string,
  numbers: number[],
): Promise<Omit<PullStatusPage, "hasNextPage">> {
  const { data, rateRemaining } = await gitlab.gql<{
    project: { mergeRequests: { nodes: StatusNode[] } } | null;
  }>(STATUSES_QUERY, { path: repo, iids: numbers.map(String) });
  const { nodes } = found(repo, data.project).mergeRequests;
  return { statuses: nodes.map(toPullStatus), rateRemaining };
}

/** Username of the account the token belongs to. */
export async function fetchViewer(gitlab: GitlabClient): Promise<string> {
  const { data } = await gitlab.gql<{ currentUser: User | null }>(
    "query Viewer { currentUser { username } }",
    {},
  );
  if (!data.currentUser) throw new GitlabError("GITLAB_TOKEN belongs to no user");
  return data.currentUser.username;
}

const LABELS_QUERY = `
query Labels($path: ID!, $after: String) {
  project(fullPath: $path) {
    labels(first: 100, after: $after, includeAncestorGroups: true) {
      pageInfo { hasNextPage endCursor }
      nodes { id title color description }
    }
  }
}`;

interface LabelsData {
  project: {
    labels: {
      pageInfo: PageInfo;
      nodes: { id: string; title: string; color: string; description: string | null }[];
    };
  } | null;
}

/**
 * The project's labels and those of the groups above it, which its merge requests can carry; one
 * per name, the project's own over a group's.
 */
export async function fetchLabels(
  gitlab: GitlabClient,
  repo: string,
): Promise<Omit<LabelDef, "repo">[]> {
  const labels = new Map<string, Omit<LabelDef, "repo">>();
  let after: string | null = null;
  do {
    const result: { data: LabelsData } = await gitlab.gql<LabelsData>(LABELS_QUERY, {
      path: repo,
      after,
    });
    const page = found(repo, result.data.project).labels;
    for (const { id, title, color, description } of page.nodes) {
      if (labels.has(title) && !id.includes("/ProjectLabel/")) continue;
      labels.set(title, { name: title, color: hex(color), description });
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return [...labels.values()];
}
