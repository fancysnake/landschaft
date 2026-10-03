import { describe, expect, it } from "vitest";

import type { Swimlane } from "../schema";

import { cellKey } from "../types";
import { DASHBOARD, label, makeIssue, REPO } from "./__fixtures__/issues";
import { buildBoard, isBlocked, labelDiffForMove, placeCard, placeIn } from "./board";

const cell = (laneId: string, colId: string) => cellKey(laneId, colId);
const TWO_REPOS = { ...DASHBOARD, repos: [REPO, "acme/other"] };
const numbers = (board: ReturnType<typeof buildBoard>) =>
  board.cells[cell("rest", "todo")]?.map((c) => c.number);

describe("placeIn", () => {
  it("takes the first labeled group that matches", () => {
    const groups = [
      { id: "a", labels: ["x"] },
      { id: "b", labels: ["y", "z"] },
    ];
    expect(placeIn(groups, new Set(["z", "x"]))?.id).toBe("a");
    expect(placeIn(groups, new Set(["z"]))?.id).toBe("b");
  });

  it("falls back to the catch-all wherever it is listed", () => {
    const groups = [
      { id: "all", labels: [] },
      { id: "a", labels: ["x"] },
    ];
    expect(placeIn(groups, new Set(["x"]))?.id).toBe("a");
    expect(placeIn(groups, new Set(["nope"]))?.id).toBe("all");
  });

  it("returns null without a match and without a catch-all", () => {
    expect(placeIn([{ id: "a", labels: ["x"] }], new Set())).toBeNull();
  });

  it('requires every label for an "all" group and falls through otherwise', () => {
    const groups = [
      { id: "both", labels: ["x", "y"], match: "all" as const },
      { id: "either", labels: ["x", "y"], match: "any" as const },
      { id: "rest", labels: [] },
    ];
    expect(placeIn(groups, new Set(["x", "y", "z"]))?.id).toBe("both");
    expect(placeIn(groups, new Set(["x"]))?.id).toBe("either");
    expect(placeIn(groups, new Set(["z"]))?.id).toBe("rest");
    expect(placeIn([groups[0]!], new Set(["y"]))).toBeNull();
  });

  it("matches a kind-only group in list order, not as the catch-all", () => {
    const groups = [
      { id: "bugs", labels: ["bug"] },
      { id: "rest", labels: [] },
      { id: "prs", labels: [], kind: "pr" as const },
    ];
    expect(placeIn(groups, new Set(["bug"]))?.id).toBe("bugs");
    expect(placeIn(groups, new Set())?.id).toBe("prs");
    expect(placeIn([groups[0]!, groups[1]!], new Set())?.id).toBe("rest");
  });

  it("takes the last match when asked, the catch-all still only as a fallback", () => {
    const groups = [
      { id: "a", labels: ["x"] },
      { id: "rest", labels: [] },
      { id: "b", labels: ["y"] },
    ];
    expect(placeIn(groups, new Set(["x", "y"]), "last")?.id).toBe("b");
    expect(placeIn(groups, new Set(["x"]), "last")?.id).toBe("a");
    expect(placeIn(groups, new Set(), "last")?.id).toBe("rest");
  });
});

describe("placeCard", () => {
  const prs: Swimlane = {
    id: "prs",
    name: "PRs",
    labels: [],
    match: "any",
    kind: "pr",
    hideBlocked: false,
  };
  const dashboard = { ...DASHBOARD, swimlanes: [prs, ...DASHBOARD.swimlanes] };

  it("lets a PR-only lane shadow the labeled lanes after it for PRs only", () => {
    expect(placeCard(dashboard, "issue", new Set(["prio:high", "phase:doing"]))).toMatchObject({
      lane: { id: "high" },
      column: { id: "doing" },
    });
    expect(placeCard(dashboard, "pr", new Set(["prio:high"]))).toMatchObject({
      lane: { id: "prs" },
      column: { id: "todo" },
    });
  });

  it("puts a card carrying two columns' labels in the later column", () => {
    expect(placeCard(DASHBOARD, "issue", new Set(["phase:done", "phase:doing"]))).toMatchObject({
      column: { id: "done" },
    });
  });

  it("ands the kind with the labels, whatever the match", () => {
    const lanes = [
      { ...prs, id: "pr-high", labels: ["prio:high", "prio:low"] },
      ...DASHBOARD.swimlanes,
    ];
    const withLanes = { ...DASHBOARD, swimlanes: lanes };
    expect(placeCard(withLanes, "pr", new Set(["prio:low"]))?.lane.id).toBe("pr-high");
    expect(placeCard(withLanes, "pr", new Set())?.lane.id).toBe("rest");
    expect(placeCard(withLanes, "issue", new Set(["prio:low"]))?.lane.id).toBe("low");
  });

  it("drops columns of the other kind", () => {
    const review = {
      ...DASHBOARD.columns[1]!,
      id: "review",
      labels: ["review"],
      kind: "pr" as const,
    };
    const withReview = { ...DASHBOARD, columns: [...DASHBOARD.columns, review] };
    expect(placeCard(withReview, "pr", new Set(["review"]))?.column.id).toBe("review");
    expect(placeCard(withReview, "issue", new Set(["review"]))?.column.id).toBe("todo");
  });

  it("returns null when no column takes the labels", () => {
    const columns = DASHBOARD.columns.filter((column) => column.labels.length > 0);
    expect(placeCard({ ...DASHBOARD, columns }, "issue", new Set())).toBeNull();
  });
});

describe("isBlocked", () => {
  it("prefers the cached blocker state over the snapshot", () => {
    const blocker = makeIssue({ number: 1, state: "CLOSED" });
    const issue = makeIssue({
      number: 2,
      blockedBy: [{ repo: REPO, number: 1, state: "OPEN" }],
      blockedByTotal: 1,
    });
    expect(isBlocked(issue, new Map([["acme/app#1", blocker]]))).toBe(false);
    expect(isBlocked(issue, new Map())).toBe(true);
  });

  it("treats a truncated blocker list as blocked", () => {
    const issue = makeIssue({ number: 2, blockedBy: [], blockedByTotal: 25 });
    expect(isBlocked(issue, new Map())).toBe(true);
  });
});

describe("buildBoard", () => {
  it("places issues by lane and column labels, catch-all otherwise", () => {
    const issues = [
      makeIssue({ number: 1, labels: [label("prio:high"), label("phase:doing")] }),
      makeIssue({ number: 2, labels: [label("prio:low")] }),
      makeIssue({ number: 3, labels: [label("phase:shipped")] }),
      makeIssue({ number: 4 }),
      makeIssue({ number: 5, state: "CLOSED", labels: [label("prio:high")] }),
    ];
    const board = buildBoard(issues, DASHBOARD);
    expect(board.cells[cell("high", "doing")]?.map((c) => c.number)).toEqual([1]);
    expect(board.cells[cell("low", "todo")]?.map((c) => c.number)).toEqual([2]);
    expect(board.cells[cell("rest", "done")]?.map((c) => c.number)).toEqual([3]);
    expect(board.cells[cell("rest", "todo")]?.map((c) => c.number)).toEqual([4]);
    expect(board.laneTotals).toEqual({ high: 1, low: 1, rest: 2 });
    expect(board.unplaced).toBe(0);
  });

  it('places by an "all" column only when the issue carries every label', () => {
    const dashboard = {
      ...DASHBOARD,
      columns: [
        { id: "todo", name: "Todo", labels: [], match: "any" as const, kind: "any" as const },
        {
          id: "doing",
          name: "Doing",
          labels: ["phase:doing"],
          match: "any" as const,
          kind: "any" as const,
        },
        {
          id: "waiting",
          name: "Waiting",
          labels: ["phase:doing", "wait"],
          match: "all" as const,
          kind: "any" as const,
        },
      ],
    };
    const issues = [
      makeIssue({ number: 1, labels: [label("phase:doing"), label("wait")] }),
      makeIssue({ number: 2, labels: [label("phase:doing")] }),
      makeIssue({ number: 3, labels: [label("wait")] }),
    ];
    const board = buildBoard(issues, dashboard);
    expect(board.cells[cell("rest", "waiting")]?.map((c) => c.number)).toEqual([1]);
    expect(board.cells[cell("rest", "doing")]?.map((c) => c.number)).toEqual([2]);
    expect(board.cells[cell("rest", "todo")]?.map((c) => c.number)).toEqual([3]);
    expect(board.labels).toEqual([]);
  });

  it('keeps only the viewer\'s authored or assigned issues under scope "mine"', () => {
    const dashboard = { ...DASHBOARD, scope: "mine" as const };
    const me = { login: "me", avatarUrl: "" };
    const issues = [
      makeIssue({ number: 1, author: "me" }),
      makeIssue({ number: 2, author: "ann", assignees: [me] }),
      makeIssue({ number: 3, author: "ann", labels: [label("epic")] }),
      makeIssue({ number: 4, author: null }),
    ];
    const mine = buildBoard(issues, dashboard, {}, "me");
    expect(numbers(mine)).toEqual([2, 1]);
    expect(mine.epics).toEqual([]);
    expect(mine.assignees).toEqual(["me"]);
    expect(numbers(buildBoard(issues, dashboard, {}, null))).toEqual([4, 3, 2, 1]);
    expect(numbers(buildBoard(issues, DASHBOARD, {}, "me"))).toEqual([4, 3, 2, 1]);
  });

  it("puts pull requests in a PR swimlane", () => {
    const dashboard = {
      ...DASHBOARD,
      swimlanes: [
        {
          id: "prs",
          name: "PRs",
          labels: [],
          match: "any" as const,
          kind: "pr" as const,
          hideBlocked: false,
        },
        ...DASHBOARD.swimlanes,
      ],
    };
    const issues = [
      makeIssue({ number: 1, kind: "pr", labels: [label("prio:high")] }),
      makeIssue({ number: 2, labels: [label("prio:high")] }),
    ];
    const board = buildBoard(issues, dashboard);
    expect(board.cells[cell("prs", "todo")]?.map((c) => c.number)).toEqual([1]);
    expect(board.cells[cell("high", "todo")]?.map((c) => c.number)).toEqual([2]);
  });

  it("matches PR status labels like labels, so one lane gathers unfinished PRs", () => {
    const dashboard = {
      ...DASHBOARD,
      swimlanes: [
        {
          id: "fix",
          name: "To fix",
          labels: ["is:conflicting", "is:ci:failed", "is:unanswered"],
          match: "any" as const,
          kind: "pr" as const,
          hideBlocked: false,
        },
        ...DASHBOARD.swimlanes,
      ],
    };
    const issues = [
      makeIssue({ number: 1, kind: "pr", statuses: ["is:conflicting"] }),
      makeIssue({ number: 2, kind: "pr", statuses: ["is:ci:failed"] }),
      makeIssue({ number: 3, kind: "pr", statuses: ["is:unanswered"] }),
      makeIssue({ number: 4, kind: "pr" }),
      makeIssue({ number: 5, kind: "pr", labels: [label("is:conflicting")] }),
    ];
    const board = buildBoard(issues, dashboard);
    expect(board.cells[cell("fix", "todo")]?.map((c) => c.number)).toEqual([3, 2, 1]);
    expect(numbers(board)).toEqual([5, 4]);
  });

  it("counts issues that fit no group when an axis has no catch-all", () => {
    const dashboard = {
      ...DASHBOARD,
      columns: [
        {
          id: "doing",
          name: "Doing",
          labels: ["phase:doing"],
          match: "any" as const,
          kind: "any" as const,
        },
      ],
    };
    const board = buildBoard([makeIssue({ number: 1 })], dashboard);
    expect(board.unplaced).toBe(1);
    expect(board.laneTotals.rest).toBe(0);
  });

  it("hides blocked issues only in lanes that ask for it", () => {
    const blockedBy = [{ repo: REPO, number: 9, state: "OPEN" as const }];
    const issues = [
      makeIssue({ number: 1, labels: [label("prio:high")], blockedBy, blockedByTotal: 1 }),
      makeIssue({ number: 2, labels: [label("prio:low")], blockedBy, blockedByTotal: 1 }),
      makeIssue({ number: 9 }),
    ];
    const board = buildBoard(issues, DASHBOARD);
    expect(board.cells[cell("high", "todo")]?.[0]).toMatchObject({ number: 1, blocked: true });
    expect(board.cells[cell("low", "todo")]).toEqual([]);
    expect(board.hiddenBlocked).toEqual({ high: 0, low: 1, rest: 0 });
  });

  it("shows an issue whose blocker is closed in the cache", () => {
    const issues = [
      makeIssue({
        number: 2,
        labels: [label("prio:low")],
        blockedBy: [{ repo: REPO, number: 1, state: "OPEN" }],
        blockedByTotal: 1,
      }),
      makeIssue({ number: 1, state: "CLOSED" }),
    ];
    const board = buildBoard(issues, DASHBOARD);
    expect(board.cells[cell("low", "todo")]?.[0]).toMatchObject({ number: 2, blocked: false });
  });

  it("strips structural labels from cards and filter options", () => {
    const issue = makeIssue({
      number: 1,
      labels: [label("prio:high"), label("phase:doing"), label("bug"), label("epic")],
      assignees: [{ login: "ann", avatarUrl: "" }],
    });
    const board = buildBoard([issue], DASHBOARD);
    const card = board.cells[cell("high", "doing")]?.[0];
    expect(card?.labels.map((l) => l.name)).toEqual(["bug"]);
    expect(card?.isEpic).toBe(true);
    expect(board.labels).toEqual(["bug"]);
    expect(board.assignees).toEqual(["ann"]);
  });

  it("sorts cells by the dashboard sort, overridable per request", () => {
    const issues = [makeIssue({ number: 1 }), makeIssue({ number: 3 }), makeIssue({ number: 2 })];
    const byDefault = buildBoard(issues, DASHBOARD);
    expect(byDefault.cells[cell("rest", "todo")]?.map((c) => c.number)).toEqual([3, 2, 1]);
    const asc = buildBoard(issues, DASHBOARD, { sort: "created", dir: "asc" });
    expect(asc.cells[cell("rest", "todo")]?.map((c) => c.number)).toEqual([1, 2, 3]);
    expect(asc.sort).toEqual({ by: "created", dir: "asc" });
  });

  it("applies text, assignee, label and epic filters together", () => {
    const issues = [
      makeIssue({
        number: 1,
        title: "Login form",
        labels: [label("bug")],
        assignees: [{ login: "ann", avatarUrl: "" }],
        parent: { repo: REPO, number: 10 },
      }),
      makeIssue({ number: 2, title: "Login page", labels: [label("bug")] }),
      makeIssue({ number: 3, title: "Logout", assignees: [{ login: "ann", avatarUrl: "" }] }),
    ];
    expect(numbers(buildBoard(issues, DASHBOARD, { q: "login" }))).toEqual([2, 1]);
    expect(numbers(buildBoard(issues, DASHBOARD, { q: "3" }))).toEqual([3]);
    expect(numbers(buildBoard(issues, DASHBOARD, { assignee: "ann" }))).toEqual([3, 1]);
    expect(numbers(buildBoard(issues, DASHBOARD, { label: "bug" }))).toEqual([2, 1]);
    expect(numbers(buildBoard(issues, DASHBOARD, { epic: "acme/app#10" }))).toEqual([1]);
    expect(numbers(buildBoard(issues, DASHBOARD, { q: "login", assignee: "ann" }))).toEqual([1]);
  });

  it("repo filter keeps only that repo's issues", () => {
    const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2, repo: "acme/other" })];
    expect(numbers(buildBoard(issues, TWO_REPOS, { repo: ["acme/other"] }))).toEqual([2]);
  });

  it("repo filter takes a list and skips repos not on the dashboard", () => {
    const three = { ...DASHBOARD, repos: [REPO, "acme/other", "acme/third"] };
    const issues = [
      makeIssue({ number: 1 }),
      makeIssue({ number: 2, repo: "acme/other" }),
      makeIssue({ number: 3, repo: "acme/third" }),
    ];
    const repo = ["acme/third", "acme/gone", "acme/app"];
    expect(numbers(buildBoard(issues, three, { repo }))).toEqual([3, 1]);
  });

  it("places pull requests next to issues and never lists them as epics", () => {
    const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2, kind: "pr" })];
    const board = buildBoard(issues, DASHBOARD);
    expect(board.cells[cell("rest", "todo")]?.map((c) => c.kind)).toEqual(["pr", "issue"]);
    const epicPr = makeIssue({ number: 3, kind: "pr", labels: [label("epic")] });
    expect(buildBoard([epicPr], DASHBOARD).epics).toEqual([]);
  });

  it("epic filter keeps PRs linked to the epic or to an issue related to it", () => {
    const epic = { repo: REPO, number: 10 };
    const issues = [
      makeIssue({ number: 1, parent: epic }),
      makeIssue({ number: 2, kind: "pr", linked: [{ repo: REPO, number: 1 }] }),
      makeIssue({ number: 3, kind: "pr", linked: [epic] }),
      makeIssue({ number: 4, kind: "pr", linked: [{ repo: REPO, number: 5 }] }),
      makeIssue({ number: 5 }),
      makeIssue({ number: 10, labels: [label("epic")] }),
    ];
    expect(numbers(buildBoard(issues, DASHBOARD, { epic: "acme/app#10" }))).toEqual([3, 2, 1]);
  });

  it("epic filter keeps sub-issues and issues blocking or blocked by the epic", () => {
    const epic = { repo: REPO, number: 10 };
    const issues = [
      makeIssue({ number: 1, parent: epic }),
      makeIssue({ number: 2, blockedBy: [{ ...epic, state: "OPEN" }], blockedByTotal: 1 }),
      makeIssue({ number: 3 }),
      makeIssue({ number: 4 }),
      makeIssue({
        number: 10,
        labels: [label("epic")],
        blockedBy: [{ repo: REPO, number: 3, state: "OPEN" }],
        blockedByTotal: 1,
      }),
    ];
    expect(numbers(buildBoard(issues, DASHBOARD, { epic: "acme/app#10" }))).toEqual([3, 2, 1]);
  });

  it("lists epics with progress regardless of non-repo filters", () => {
    const issues = [
      makeIssue({
        number: 10,
        title: "Auth epic",
        labels: [label("epic")],
        subIssues: { total: 4, completed: 1, percent: 25 },
      }),
      makeIssue({ number: 11, labels: [label("epic")] }),
    ];
    const board = buildBoard(issues, DASHBOARD, { q: "nothing matches" });
    expect(board.epics).toEqual([
      expect.objectContaining({ key: "acme/app#11", progress: null }),
      expect.objectContaining({
        key: "acme/app#10",
        progress: { total: 4, completed: 1, percent: 25 },
      }),
    ]);
    expect(board.cells[cell("rest", "todo")]).toEqual([]);
  });

  it("hides epics from other repos under the repo filter", () => {
    const issues = [
      makeIssue({ number: 10, labels: [label("epic")] }),
      makeIssue({ number: 11, repo: "acme/other", labels: [label("epic")] }),
    ];
    const board = buildBoard(issues, TWO_REPOS, { repo: ["acme/other"] });
    expect(board.epics.map((epic) => epic.key)).toEqual(["acme/other#11"]);
  });

  it("ignores a repo filter for a repo not on the dashboard", () => {
    const issues = [
      makeIssue({ number: 1 }),
      makeIssue({ number: 10, repo: "acme/other", labels: [label("epic")] }),
    ];
    const board = buildBoard(issues, TWO_REPOS, { repo: ["acme/gone"] });
    expect(numbers(board)).toEqual([10, 1]);
    expect(board.epics.map((epic) => epic.key)).toEqual(["acme/other#10"]);
  });

  it("skips epics when no epic label is configured", () => {
    const dashboard = { ...DASHBOARD, epicLabel: undefined };
    const board = buildBoard([makeIssue({ number: 1, labels: [label("epic")] })], dashboard);
    expect(board.epics).toEqual([]);
    expect(board.cells[cell("rest", "todo")]?.[0]?.labels.map((l) => l.name)).toEqual(["epic"]);
  });
});

describe("labelDiffForMove", () => {
  const high = { id: "high", labels: ["prio:high"] };
  const low = { id: "low", labels: ["prio:low"] };
  const rest = { id: "rest", labels: [] };
  const todo = { id: "todo", labels: [] };
  const doing = { id: "doing", labels: ["phase:doing"] };
  const done = { id: "done", labels: ["phase:done", "phase:shipped"] };

  it("never adds a status label, only the first real one", () => {
    const fix = { id: "fix", labels: ["is:ci:failed", "needs-fix"] };
    expect(
      labelDiffForMove(["prio:high"], { lane: high, col: todo }, { lane: fix, col: todo }),
    ).toEqual({ add: ["needs-fix"], remove: ["prio:high"] });
    expect(
      labelDiffForMove(
        [],
        { lane: rest, col: todo },
        { lane: { ...fix, match: "all" }, col: todo },
      ),
    ).toEqual({ add: ["needs-fix"], remove: [] });
  });

  it("swaps the column label when only the column changes", () => {
    expect(
      labelDiffForMove(
        ["prio:high", "phase:doing"],
        { lane: high, col: doing },
        { lane: high, col: done },
      ),
    ).toEqual({ add: ["phase:done"], remove: ["phase:doing"] });
  });

  it("swaps the lane label when only the lane changes", () => {
    expect(
      labelDiffForMove(["prio:high"], { lane: high, col: todo }, { lane: low, col: todo }),
    ).toEqual({
      add: ["prio:low"],
      remove: ["prio:high"],
    });
  });

  it("changes both axes at once", () => {
    expect(
      labelDiffForMove(["prio:high"], { lane: high, col: todo }, { lane: low, col: doing }),
    ).toEqual({
      add: ["prio:low", "phase:doing"],
      remove: ["prio:high"],
    });
  });

  it("only removes when the target is a catch-all", () => {
    expect(
      labelDiffForMove(
        ["prio:high", "phase:shipped"],
        { lane: high, col: done },
        { lane: rest, col: todo },
      ),
    ).toEqual({ add: [], remove: ["prio:high", "phase:shipped"] });
  });

  it("removes every source label the issue carries, adds only the first target label", () => {
    expect(
      labelDiffForMove(
        ["phase:done", "phase:shipped"],
        { lane: rest, col: done },
        { lane: rest, col: doing },
      ),
    ).toEqual({ add: ["phase:doing"], remove: ["phase:done", "phase:shipped"] });
  });

  it("does not add a label the issue already has", () => {
    expect(
      labelDiffForMove(
        ["prio:high", "prio:low"],
        { lane: high, col: todo },
        { lane: low, col: todo },
      ),
    ).toEqual({ add: [], remove: ["prio:high"] });
  });

  it("is a no-op when nothing changes", () => {
    expect(
      labelDiffForMove(["prio:high"], { lane: high, col: todo }, { lane: high, col: todo }),
    ).toEqual({
      add: [],
      remove: [],
    });
  });

  it('adds every missing label of an "all" target and keeps the ones present', () => {
    const waiting = { id: "waiting", labels: ["phase:doing", "wait"], match: "all" as const };
    expect(
      labelDiffForMove(["phase:doing"], { lane: rest, col: doing }, { lane: rest, col: waiting }),
    ).toEqual({ add: ["wait"], remove: [] });
    expect(
      labelDiffForMove(["phase:done"], { lane: rest, col: done }, { lane: rest, col: waiting }),
    ).toEqual({ add: ["phase:doing", "wait"], remove: ["phase:done"] });
  });

  it('removes all labels of an "all" source when leaving it', () => {
    const waiting = { id: "waiting", labels: ["phase:doing", "wait"], match: "all" as const };
    expect(
      labelDiffForMove(
        ["phase:doing", "wait"],
        { lane: rest, col: waiting },
        { lane: rest, col: doing },
      ),
    ).toEqual({ add: [], remove: ["wait"] });
  });
});
