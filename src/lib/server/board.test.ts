import { describe, expect, it } from "vitest";

import { askedLabels, type FilterNode } from "../filter";
import { cellKey } from "../types";
import { DASHBOARD, label, makeIssue, REPO } from "./__fixtures__/issues";
import { buildBoard, compile, isBlocked, placeIn } from "./board";

const cell = (laneId: string, colId: string) => cellKey(laneId, colId);
const numbers = (board: ReturnType<typeof buildBoard>) =>
  board.cells[cell("rest", "todo")]?.map((c) => c.number);

/** A filter hits when it asks for one of the labels `hits`. */
const hitting =
  (...hits: string[]) =>
  (node: FilterNode) =>
    askedLabels(node).some((name) => hits.includes(name));

const ids = (groups: { id: string }[]) => groups.map((group) => group.id);

describe("placeIn", () => {
  it("takes every group that matches, an empty filter matching all", () => {
    const groups = compile([
      { id: "a", filter: "label:x" },
      { id: "b", filter: "label:y" },
      { id: "all", filter: "" },
    ]);
    expect(ids(placeIn(groups, hitting("y", "x")))).toEqual(["a", "b", "all"]);
    expect(ids(placeIn(groups, hitting("y")))).toEqual(["b", "all"]);
  });

  it("returns nothing without a match and without `other`", () => {
    expect(placeIn(compile([{ id: "a", filter: "label:x" }]), () => false)).toEqual([]);
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

const waitsOn = (number: number) => [{ repo: REPO, number, state: "OPEN" as const }];

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

  it("places by a column that asks for every one of its labels", () => {
    const dashboard = {
      ...DASHBOARD,
      columns: [
        { id: "todo", name: "Todo", filter: "-label:phase:doing" },
        { id: "doing", name: "Doing", filter: "label:phase:doing" },
        { id: "waiting", name: "Waiting", filter: "label:phase:doing label:wait" },
      ],
    };
    const issues = [
      makeIssue({ number: 1, labels: [label("phase:doing"), label("wait")] }),
      makeIssue({ number: 2, labels: [label("phase:doing")] }),
      makeIssue({ number: 3, labels: [label("wait")] }),
    ];
    const board = buildBoard(issues, dashboard);
    expect(board.cells[cell("rest", "waiting")]?.map((c) => c.number)).toEqual([1]);
    expect(board.cells[cell("rest", "doing")]?.map((c) => c.number)).toEqual([2, 1]);
    expect(board.cells[cell("rest", "todo")]?.map((c) => c.number)).toEqual([3]);
    expect(board.labels).toEqual([]);
  });

  it("keeps only issues the listed users authored or are assigned to", () => {
    const issues = [
      makeIssue({ number: 1, author: "Ann" }),
      makeIssue({ number: 2, author: "bob", assignees: [{ login: "cid", avatarUrl: "" }] }),
      makeIssue({ number: 3, author: "dan" }),
      makeIssue({ number: 4, author: "renovate" }),
    ];
    const users = (list: string[], viewer: string | null = null) =>
      numbers(buildBoard(issues, DASHBOARD, {}, list, new Set(), viewer));
    expect(users(["ann", "cid"])).toEqual([2, 1]);
    expect(users(["@ME", "ann"], "dan")).toEqual([3, 1]);
    expect(users(["@me", "ann"])).toEqual([1]);
    expect(users(["@me"])).toEqual([]);
    expect(users(["renovate[bot]"])).toEqual([4]);
    expect(users([])).toEqual([4, 3, 2, 1]);
  });

  it("keeps only the viewer's authored or assigned issues under @me", () => {
    const dashboard = DASHBOARD;
    const me = { login: "me", avatarUrl: "" };
    const issues = [
      makeIssue({ number: 1, author: "me" }),
      makeIssue({ number: 2, author: "ann", assignees: [me] }),
      makeIssue({ number: 3, author: "ann", labels: [label("epic")] }),
      makeIssue({ number: 4, author: null }),
    ];
    const mine = buildBoard(issues, dashboard, {}, ["@me"], new Set(), "me");
    expect(numbers(mine)).toEqual([2, 1]);
    expect(mine.epics).toEqual([]);
    expect(mine.assignees).toEqual(["me"]);
  });

  it("gives `other` what no earlier lane took", () => {
    const dashboard = {
      ...DASHBOARD,
      swimlanes: [
        { id: "a", name: "A", filter: "label:a", hideBlocked: false },
        { id: "b", name: "B", filter: "other label:b", hideBlocked: false },
        { id: "rest", name: "Rest", filter: "other", hideBlocked: false },
      ],
    };
    const issues = [
      makeIssue({ number: 1, labels: [label("a"), label("b")] }),
      makeIssue({ number: 2, labels: [label("b")] }),
      makeIssue({ number: 3 }),
    ];
    const board = buildBoard(issues, dashboard);
    const lane = (id: string) => board.cells[cell(id, "todo")]?.map((c) => c.number);
    expect(lane("a")).toEqual([1]);
    expect(lane("b")).toEqual([2]);
    expect(lane("rest")).toEqual([3]);
  });

  it("gives a column's `other` what no column to its right took", () => {
    const dashboard = {
      ...DASHBOARD,
      columns: [
        { id: "rest", name: "Rest", filter: "other" },
        { id: "b", name: "B", filter: "other label:b" },
        { id: "a", name: "A", filter: "label:a" },
      ],
    };
    const issues = [
      makeIssue({ number: 1, labels: [label("a"), label("b")] }),
      makeIssue({ number: 2, labels: [label("b")] }),
      makeIssue({ number: 3 }),
    ];
    const board = buildBoard(issues, dashboard);
    const column = (id: string) => board.cells[cell("rest", id)]?.map((c) => c.number);
    expect(column("a")).toEqual([1]);
    expect(column("b")).toEqual([2]);
    expect(column("rest")).toEqual([3]);
  });

  it("puts pull requests in a PR swimlane and in every other lane they match", () => {
    const dashboard = {
      ...DASHBOARD,
      swimlanes: [
        { id: "prs", name: "PRs", filter: "is:pr", hideBlocked: false },
        ...DASHBOARD.swimlanes,
      ],
    };
    const issues = [
      makeIssue({ number: 1, kind: "pr", labels: [label("prio:high")] }),
      makeIssue({ number: 2, labels: [label("prio:high")] }),
    ];
    const board = buildBoard(issues, dashboard);
    expect(board.cells[cell("prs", "todo")]?.map((c) => c.number)).toEqual([1]);
    expect(board.cells[cell("high", "todo")]?.map((c) => c.number)).toEqual([2, 1]);
  });

  it("shows an issue in every lane and column it matches, counting it once", () => {
    const issues = [
      makeIssue({
        number: 1,
        labels: [label("prio:high"), label("prio:low"), label("phase:doing"), label("phase:done")],
      }),
    ];
    const board = buildBoard(issues, DASHBOARD);
    for (const lane of ["high", "low"])
      for (const column of ["doing", "done"])
        expect(board.cells[cell(lane, column)]?.map((c) => c.number)).toEqual([1]);
    expect(board.cells[cell("rest", "todo")]).toEqual([]);
    expect(board.laneTotals).toEqual({ high: 1, low: 1, rest: 0 });
    expect(board.columnTotals).toEqual({ todo: 0, doing: 1, done: 1 });
    expect(board.total).toBe(1);
  });

  it("matches PR statuses, so one lane gathers unfinished PRs", () => {
    const dashboard = {
      ...DASHBOARD,
      swimlanes: [
        {
          id: "fix",
          name: "To fix",
          filter: "is:pr is:conflicting|ci:failed|unanswered",
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
    expect(board.cells[cell("fix", "todo")]?.map((c) => c.statuses)).toEqual([
      ["is:unanswered"],
      ["is:ci:failed"],
      ["is:conflicting"],
    ]);
    expect(numbers(board)).toEqual([5, 4]);
  });

  it("matches is:has-pr on issues an open PR closes, whoever's the PR", () => {
    const dashboard = {
      ...DASHBOARD,
      swimlanes: [
        { id: "review", name: "In review", filter: "is:issue is:has-pr", hideBlocked: false },
        ...DASHBOARD.swimlanes,
      ],
    };
    const alice = { author: "alice" };
    const issues = [
      makeIssue({ number: 1, ...alice }),
      makeIssue({ number: 2, ...alice }),
      makeIssue({ number: 3, ...alice }),
      makeIssue({ number: 4, ...alice, labels: [label("is:has-pr")] }),
      makeIssue({ number: 10, kind: "pr", author: "bob", linked: [{ repo: REPO, number: 1 }] }),
      makeIssue({
        number: 11,
        kind: "pr",
        state: "CLOSED",
        linked: [{ repo: REPO, number: 2 }],
      }),
    ];
    const board = buildBoard(issues, dashboard, {}, ["alice"]);
    expect(board.cells[cell("review", "todo")]?.map((c) => [c.number, c.statuses])).toEqual([
      [1, ["is:has-pr"]],
    ]);
  });

  it("counts issues that fit no group when an axis has no catch-all", () => {
    const dashboard = {
      ...DASHBOARD,
      columns: [{ id: "doing", name: "Doing", filter: "label:phase:doing" }],
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

  it("matches the epic label and structural labels whatever their case", () => {
    const issues = [
      makeIssue({ number: 1, labels: [label("Epic")] }),
      makeIssue({ number: 2, labels: [label("epic"), label("Prio:High"), label("Bug")] }),
      makeIssue({ number: 3, labels: [label("bug")] }),
    ];
    const board = buildBoard(issues, DASHBOARD);
    expect(board.epics.map((epic) => epic.number)).toEqual([2, 1]);
    expect(board.cells[cell("high", "todo")]?.[0]?.labels.map((l) => l.name)).toEqual(["Bug"]);
    expect(board.labels).toEqual(["Bug"]);
    expect(numbers(buildBoard(issues, DASHBOARD, { label: "BUG" }))).toEqual([3]);
  });

  it("matches is:blocking on items an open issue waits on, and @me as the viewer", () => {
    const dashboard = {
      ...DASHBOARD,
      swimlanes: [
        { id: "blocking", name: "Blocking", filter: "is:blocking", hideBlocked: false },
        { id: "mine", name: "Mine", filter: "user:@me", hideBlocked: false },
        ...DASHBOARD.swimlanes,
      ],
    };
    const issues = [
      makeIssue({ number: 1 }),
      makeIssue({ number: 2, blockedBy: waitsOn(1), blockedByTotal: 1 }),
      makeIssue({ number: 3 }),
      makeIssue({ number: 4, state: "CLOSED", blockedBy: waitsOn(3), blockedByTotal: 1 }),
      makeIssue({ number: 5, author: "me" }),
    ];
    const board = buildBoard(issues, dashboard, {}, [], new Set(), "me");
    expect(board.cells[cell("blocking", "todo")]?.map((c) => c.number)).toEqual([1]);
    expect(board.cells[cell("mine", "todo")]?.map((c) => c.number)).toEqual([5]);
    expect(numbers(board)).toEqual([3, 2]);
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
    expect(numbers(buildBoard(issues, DASHBOARD, { repo: ["acme/other"] }))).toEqual([2]);
  });

  it("repo filter takes a list and skips repos not on the dashboard", () => {
    const issues = [
      makeIssue({ number: 1 }),
      makeIssue({ number: 2, repo: "acme/other" }),
      makeIssue({ number: 3, repo: "acme/third" }),
    ];
    const repo = ["acme/third", "acme/gone", "acme/app"];
    expect(numbers(buildBoard(issues, DASHBOARD, { repo }))).toEqual([3, 1]);
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

  it("lists starred epics first, each group in sort order", () => {
    const issues = [10, 11, 12, 13].map((number) => makeIssue({ number, labels: [label("epic")] }));
    const starred = new Set(["acme/app#10", "acme/app#12", "acme/app#99"]);
    const epics = buildBoard(issues, DASHBOARD, {}, [], starred).epics;
    expect(epics.map((epic) => [epic.number, epic.starred])).toEqual([
      [12, true],
      [10, true],
      [13, false],
      [11, false],
    ]);
  });

  it("hides epics from other repos under the repo filter", () => {
    const issues = [
      makeIssue({ number: 10, labels: [label("epic")] }),
      makeIssue({ number: 11, repo: "acme/other", labels: [label("epic")] }),
    ];
    const board = buildBoard(issues, DASHBOARD, { repo: ["acme/other"] });
    expect(board.epics.map((epic) => epic.key)).toEqual(["acme/other#11"]);
  });

  it("ignores a repo filter for a repo not on the dashboard", () => {
    const issues = [
      makeIssue({ number: 1 }),
      makeIssue({ number: 10, repo: "acme/other", labels: [label("epic")] }),
    ];
    const board = buildBoard(issues, DASHBOARD, { repo: ["acme/gone"] });
    expect(numbers(board)).toEqual([10, 1]);
    expect(board.epics.map((epic) => epic.key)).toEqual(["acme/other#10"]);
  });

  it("narrows to the dashboard filter, epics included, hiding the labels it asks for", () => {
    const dashboard = { ...DASHBOARD, filter: "repo:acme/other OR user:@me label:team" };
    const issues = [
      makeIssue({ number: 1, labels: [label("team")] }),
      makeIssue({ number: 2, author: "me", labels: [label("team")] }),
      makeIssue({ number: 3, repo: "acme/other", labels: [label("epic")] }),
      makeIssue({ number: 4, author: "me" }),
      makeIssue({ number: 10, labels: [label("epic")] }),
    ];
    const board = buildBoard(issues, dashboard, {}, [], new Set(), "me");
    expect(numbers(board)).toEqual([3, 2]);
    expect(board.epics.map((epic) => epic.key)).toEqual(["acme/other#3"]);
    expect(board.cells[cell("rest", "todo")]?.[1]?.labels).toEqual([]);
    expect(board.repos).toEqual(["acme/app", "acme/other"]);
  });

  it("lists the repos among the dashboard's items, shown or not", () => {
    const issues = [
      makeIssue({ number: 1, repo: "acme/b" }),
      makeIssue({ number: 2, repo: "acme/a" }),
      makeIssue({ number: 3, repo: "acme/c", state: "CLOSED" }),
    ];
    expect(buildBoard(issues, DASHBOARD, { repo: ["acme/a"] }).repos).toEqual(["acme/a", "acme/b"]);
  });

  it("hides repos turned off elsewhere unless the URL picks repos", () => {
    const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2, repo: "acme/other" })];
    const hide = ["acme/other", "acme/gone"];
    expect(numbers(buildBoard(issues, DASHBOARD, { hide }))).toEqual([1]);
    expect(numbers(buildBoard(issues, DASHBOARD, { hide, repo: ["acme/other"] }))).toEqual([2]);
    expect(numbers(buildBoard(issues, DASHBOARD, { hide: [REPO, "acme/other"] }))).toEqual([]);
  });

  it("skips epics when no epic label is configured", () => {
    const dashboard = { ...DASHBOARD, epicLabel: undefined };
    const board = buildBoard([makeIssue({ number: 1, labels: [label("epic")] })], dashboard);
    expect(board.epics).toEqual([]);
    expect(board.cells[cell("rest", "todo")]?.[0]?.labels.map((l) => l.name)).toEqual(["epic"]);
  });
});
