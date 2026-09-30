import type { Issue, LabelRef } from "../types";
import type { Db } from "./db";
import type { Syncer } from "./sync";

import { type Dashboard, fitsKind, type MoveRequest } from "../schema";
import { labelDiffForMove, placeCard } from "./board";
import { addLabels, type GithubClient, removeLabel } from "./github";

export class MoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoveError";
  }
}

export interface MoveDeps {
  db: Db;
  gh: GithubClient;
  syncer: Syncer;
}

export interface MoveResult {
  issue: Issue;
  add: string[];
  remove: string[];
}

function find<T extends { id: string }>(items: T[], id: string, what: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new MoveError(`unknown ${what} "${id}"`);
  return item;
}

/** Applies the label diff on GitHub, patches the cache, then refetches the issue. */
export async function moveIssue(
  deps: MoveDeps,
  dashboard: Dashboard,
  request: MoveRequest,
): Promise<MoveResult> {
  if (!dashboard.repos.includes(request.repo)) {
    throw new MoveError(`${request.repo} is not part of dashboard "${dashboard.name}"`);
  }
  const from = {
    lane: find(dashboard.swimlanes, request.from.laneId, "swimlane"),
    col: find(dashboard.columns, request.from.colId, "column"),
  };
  const to = {
    lane: find(dashboard.swimlanes, request.to.laneId, "swimlane"),
    col: find(dashboard.columns, request.to.colId, "column"),
  };
  const issue = deps.db.getIssue(request.repo, request.number);
  if (!issue)
    throw new MoveError(`${request.repo}#${request.number} is not in the cache, sync first`);
  for (const [what, group] of [
    ["swimlane", to.lane],
    ["column", to.col],
  ] as const) {
    if (!fitsKind(group.labels, issue.kind))
      throw new MoveError(
        `${what} "${group.name}" takes no ${issue.kind === "pr" ? "PRs" : "issues"}`,
      );
  }

  const names = issue.labels.map((label) => label.name);
  const diff = labelDiffForMove(names, from, to);
  const after = new Set([...names.filter((name) => !diff.remove.includes(name)), ...diff.add]);
  const landed = placeCard(dashboard, issue.kind, after);
  if (landed?.lane.id !== to.lane.id || landed.column.id !== to.col.id)
    throw new MoveError(
      `another swimlane or column takes the card instead of "${to.lane.name}" / "${to.col.name}"`,
    );
  for (const name of diff.remove) await removeLabel(deps.gh, request.repo, request.number, name);
  await addLabels(deps.gh, request.repo, request.number, diff.add);

  const colors = new Map(
    deps.db.listLabels([request.repo]).map((label) => [label.name, label.color]),
  );
  const labels: LabelRef[] = [
    ...issue.labels.filter((label) => !diff.remove.includes(label.name)),
    ...diff.add.map((name) => ({ name, color: colors.get(name) ?? "888888" })),
  ];
  deps.db.patchLabels(request.repo, request.number, labels);
  deps.syncer.bump();

  const fresh = await deps.syncer.syncIssue(request.repo, request.number).catch(() => null);
  return { issue: fresh ?? { ...issue, labels }, add: diff.add, remove: diff.remove };
}
