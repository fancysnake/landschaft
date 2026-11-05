import type { SortBy, SortDir } from "./config";
import type { Assignee, CiJob, IssueKind, IssueState, LabelRef, Progress } from "./issues";
import type { PullStatusLabel } from "./status";

/**
 * Who a view is for: the global `users` (empty for everyone), the login `@me` stands for and the
 * repos they switched off.
 */
export interface Audience {
  users: string[];
  viewer: string | null;
  hidden: string[];
}

export type Card = IssueItemCard | CiJobCard;

export interface CiJobCard extends Omit<CiJob, "authors"> {
  key: string;
  kind: "ci-job";
  /** Its open PR's labels. */
  labels: LabelRef[];
}

export interface IssueItemCard {
  key: string;
  kind: IssueKind;
  repo: string;
  number: number;
  title: string;
  url: string;
  state: IssueState;
  /** GitHub's issue type; null for PRs and untyped issues. */
  issueType: string | null;
  assignees: Assignee[];
  labels: LabelRef[];
  progress: Progress | null;
  blocked: boolean;
  statuses: PullStatusLabel[];
  /** An open PR closes it. */
  hasPr: boolean;
  createdAt: string;
  updatedAt: string;
}

/** What the filter bar and repo chips need from any dashboard view. */
export interface Facets {
  /** Repos among the dashboard's items, whether shown or not; the view's repo chips. */
  repos: string[];
  /** The `repos` switched off, whose items the view leaves out. */
  hidden: string[];
  assignees: string[];
  labels: string[];
  /** GitHub issue types among the dashboard's items. */
  types: string[];
  /** Names of the failed CI jobs among the dashboard's items. */
  jobs: string[];
  sort: { by: SortBy; dir: SortDir };
}

export interface Inbox extends Facets {
  /** Cards by group id; each item sits in the first group it matches. */
  groups: Record<string, Card[]>;
  /** Items shown in a group. */
  total: number;
}

export interface Board extends Facets {
  cells: Record<string, Card[]>;
  laneTotals: Record<string, number>;
  /** Issues shown in each column; one in several lanes counts once. */
  columnTotals: Record<string, number>;
  hiddenBlocked: Record<string, number>;
  /** Ids of the ranked columns with the fewest cards, by lane; none when all of them tie. */
  lowest: Record<string, string[]>;
  /** Issues fluid lanes alone hide as blocked, by column; shown in no lane. */
  fluidHiddenBlocked: Record<string, number>;
  /** Issues shown in at least one cell; one in several cells counts once. */
  total: number;
}

export function cellKey(laneId: string, colId: string): string {
  return `${laneId}:${colId}`;
}

/** The grid's rows, top to bottom: a solid lane alone, adjacent fluid lanes together. */
export function laneRows<T extends { fluid: boolean }>(lanes: T[]): [T, ...T[]][] {
  const rows: [T, ...T[]][] = [];
  for (const lane of lanes) {
    const last = rows.at(-1);
    if (lane.fluid && last?.[0].fluid) last.push(lane);
    else rows.push([lane]);
  }
  return rows;
}

/** What the nav shows. */
export interface NavData {
  /** Each with the repos among its items. */
  dashboards: { id: string; name: string; repos: string[] }[];
  /** The global repos. */
  repos: string[];
  /** Those of `repos` switched off. */
  hidden: string[];
  refreshMinutes: number;
}

/** Free-text filters: set from the filter bar, cleared together by "Clear filters". */
export const TEXT_FILTER_KEYS = ["q", "assignee", "label", "type", "job"] as const;
export type TextFilterKey = (typeof TEXT_FILTER_KEYS)[number];

export type Filters = { [K in TextFilterKey]?: string } & {
  sort?: SortBy;
  dir?: SortDir;
};

/** What the unmatched view is built from: a filter on the items. */
export interface UnmatchedQuery {
  filter?: string;
}
