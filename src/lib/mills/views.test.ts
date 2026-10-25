import { describe, expect, it } from "vitest";

import { DASHBOARD, REPO } from "../__fixtures__/issues";
import { ConfigSchema } from "../pacts/schema";
import { InvalidError, NotFoundError } from "../pacts/services";
import { Views } from "./views";

function views() {
  const config = ConfigSchema.parse({ repos: [REPO], dashboards: [DASHBOARD] });
  const starred = new Set<string>();
  const store = {
    snapshot: () => ({ issues: [], jobs: [] }),
    listLabels: () => [],
    starredEpics: () => new Set(starred),
    setEpicStarred: (_: string, epic: string, on: boolean) =>
      void (on ? starred.add(epic) : starred.delete(epic)),
  };
  const syncer = {
    status: () => ({
      version: 0,
      runs: 0,
      lastSyncAt: null,
      lastError: null,
      rateRemaining: null,
      inFlight: [],
      viewer: null,
    }),
  };
  return new Views({ config: () => config, store, syncer, viewer: async () => null });
}

describe("Views", () => {
  it("builds a board with no viewer", async () => {
    const { dashboard, board } = await views().board(DASHBOARD.id, {});
    expect(dashboard.id).toBe(DASHBOARD.id);
    expect(board.total).toBe(0);
  });

  it("finds no inbox under a board's id", async () => {
    await expect(views().inbox(DASHBOARD.id, {})).rejects.toThrow(NotFoundError);
  });

  it("stars epics of configured repos only", () => {
    const v = views();
    expect(v.starEpic(DASHBOARD.id, `${REPO}#1`, true)).toEqual([`${REPO}#1`]);
    expect(() => v.starEpic(DASHBOARD.id, "other/repo#1", true)).toThrow(InvalidError);
    expect(() => v.starEpic("nope", `${REPO}#1`, true)).toThrow(NotFoundError);
  });
});
