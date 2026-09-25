import type { Dashboard, MoveRequest } from "../schema";
import type { Issue, LabelRef } from "../types";
import type { Db } from "./db";
import type { Syncer } from "./sync";

import { labelDiffForMove } from "./board";
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

  const diff = labelDiffForMove(
    issue.labels.map((label) => label.name),
    from,
    to,
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
