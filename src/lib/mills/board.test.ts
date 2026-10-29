import { describe, expect, it } from "vitest";

import type { InboxDashboard, ViewQuery } from "../pacts/schema";

import {
  DASHBOARD,
  EVERYONE,
  label,
  makeIssue,
  makeJob,
  REPO,
  snapshot,
} from "../__fixtures__/issues";
import { askedLabels, type FilterNode } from "../pacts/filter";
import { type Card, cellKey, type Issue } from "../pacts/types";
import {
  buildBoard,
  buildInbox,
  compile,
  isBlocked,
  placeIn,
  scopedRepos,
  unmatchedItems,
} from "./board";

/** An issue card's number, a CI job card's key. */
const numberOf = (card: Card) => (card.kind === "ci-job" ? card.name : card.number);
const asIssue = (card: Card | undefined) => (card?.kind === "ci-job" ? undefined : card);

const cell = (laneId: string, colId: string) => cellKey(laneId, colId);
const numbers = (board: ReturnType<typeof buildBoard>) =>
  board.cells[cell("rest", "todo")]?.map(numberOf);
/** `numbers` of a `DASHBOARD` board over `issues` under `query`. */
const shown = (issues: Issue[], query: ViewQuery) =>
  numbers(buildBoard(snapshot(issues), DASHBOARD, { ...EVERYONE, query }));

/** A filter hits when it asks for one of the labels `hits`. */
const hitting =
  (...hits: string[]) =>
  (node: FilterNode) =>
    askedLabels(node).some((name) => hits.includes(name));

const ids = (groups: { id: string }[]) => groups.map((group) => group.id);

/** A PR `number` that closes the issue `closes`. */
const prFor = (number: number, closes: number, state: Issue["state"] = "OPEN") =>
  makeIssue({ number, kind: "pr", state, linked: [{ repo: REPO, number: closes }] });

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

describe("scopedRepos", () => {
  it("takes the repos of the users' open items and jobs that pass the dashboard filter", () => {
    const team = [label("team")];
    const issues = [
      makeIssue({ number: 1, repo: "a/1", author: "ann", labels: team }),
      makeIssue({ number: 2, repo: "a/2", author: "me", labels: team }),
      makeIssue({ number: 3, repo: "a/3", author: "me", labels: team, state: "CLOSED" }),
      makeIssue({ number: 4, repo: "a/4", author: "me" }),
      makeIssue({ number: 5, repo: "a/5", author: "bob", labels: team }),
    ];
    const jobs = [makeJob({ name: "lint", repo: "a/6", authors: ["me"] })];
    const scoped = (filter: string, users: string[]) => [
      ...scopedRepos(snapshot(issues, jobs), { filter }, { users, viewer: "me" }),
    ];
    expect(scoped("label:team", ["@me", "ann"])).toEqual(["a/1", "a/2"]);
    expect(scoped("label:team", [])).toEqual(["a/1", "a/2", "a/5"]);
    expect(scoped("", ["@me"])).toEqual(["a/2", "a/4", "a/6"]);
    expect(scoped("is:ci-job", ["@me"])).toEqual(["a/6"]);
  });
});

describe("unmatchedItems", () => {
  it("lists the users' open items no dashboard places, newest first", () => {
    const narrow = {
      ...DASHBOARD,
      id: "narrow",
      filter: "label:team",
      columns: [{ id: "doing", name: "Doing", filter: "label:phase:doing" }],
    };
    const wide = { ...DASHBOARD, id: "wide", filter: "label:infra" };
    const mine = { author: "me" };
    const issues = [
      makeIssue({ number: 1, ...mine, labels: [label("team"), label("phase:doing")] }),
      makeIssue({ number: 2, ...mine, labels: [label("team")] }),
      makeIssue({ number: 3, ...mine, labels: [label("infra")] }),
      makeIssue({ number: 4, ...mine }),
      makeIssue({ number: 5, ...mine, state: "CLOSED" }),
      makeIssue({ number: 6, author: "bob" }),
      // In a lane that hides it as blocked, by an item outside the users.
      makeIssue({
        number: 7,
        ...mine,
        labels: [label("infra"), label("prio:low")],
        blockedBy: waitsOn(8),
        blockedByTotal: 1,
      }),
      makeIssue({ number: 8, author: "bob" }),
    ];
    const unmatched = unmatchedItems(snapshot(issues), [narrow, wide], {
      users: ["@me"],
      viewer: "me",
    }).items;
    expect(unmatched.map(numberOf)).toEqual([4, 2]);
  });

  it("counts an epic in a board's strip as placed", () => {
    const board = { ...DASHBOARD, columns: [{ id: "doing", name: "Doing", filter: "label:x" }] };
    const issues = [
      makeIssue({ number: 1, labels: [label("Epic")] }),
      makeIssue({ number: 2, kind: "pr", labels: [label("epic")] }),
      makeIssue({ number: 3 }),
    ];
    expect(unmatchedItems(snapshot(issues), [board], EVERYONE).items.map(numberOf)).toEqual([3, 2]);
  });

  it("drops hidden repos after placement, so their items still count", () => {
    const dashboard = {
      ...DASHBOARD,
      swimlanes: [{ id: "all", name: "All", filter: "", hideBlocked: false }],
      columns: [
        { id: "review", name: "Review", filter: "has:pr" },
        { id: "blocking", name: "Blocking", filter: "is:blocking" },
      ],
    };
    const lib = { repo: "acme/lib" };
    const issues = [
      makeIssue({ number: 1 }),
      makeIssue({ number: 2 }),
      makeIssue({ number: 3 }),
      makeIssue({ number: 10, ...lib, kind: "pr", linked: [{ repo: REPO, number: 1 }] }),
      makeIssue({ number: 11, ...lib, blockedBy: waitsOn(2), blockedByTotal: 1 }),
    ];
    const unmatched = (hide: string[]) =>
      unmatchedItems(snapshot(issues), [dashboard], { ...EVERYONE, query: { hide } }).items.map(
        numberOf,
      );
    expect(unmatched([])).toEqual([11, 10, 3]);
    expect(unmatched(["acme/lib"])).toEqual([3]);
  });

  it("lists every open item when no dashboard has a swimlane", () => {
    const dashboard = { ...DASHBOARD, swimlanes: [] };
    const unmatched = unmatchedItems(
      snapshot([makeIssue({ number: 1 })]),
      [dashboard],
      EVERYONE,
    ).items;
    expect(unmatched.map(numberOf)).toEqual([1]);
  });

  it("keeps only the items that pass the filter", () => {
    const dashboard = { ...DASHBOARD, swimlanes: [] };
    const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2, kind: "pr" })];
    const unmatched = unmatchedItems(snapshot(issues), [dashboard], {
      ...EVERYONE,
      query: { filter: "is:pr" },
    }).items;
    expect(unmatched.map(numberOf)).toEqual([2]);
  });

  it("applies the filter to CI jobs", () => {
    const dashboard = { ...DASHBOARD, swimlanes: [] };
    const unmatched = (filter: string) =>
      unmatchedItems(
        snapshot([makeIssue({ number: 1 })], [makeJob({ name: "lint" })]),
        [dashboard],
        { ...EVERYONE, query: { filter } },
      ).items.map(numberOf);
    expect(unmatched("is:ci-job")).toEqual(["lint"]);
    expect(unmatched("-is:ci-job")).toEqual([1]);
  });

  it("resolves `has:pr` against PRs the filter drops", () => {
    const dashboard = { ...DASHBOARD, swimlanes: [] };
    const issues = [
      makeIssue({ number: 1 }),
      makeIssue({ number: 2, kind: "pr", linked: [{ repo: REPO, number: 1 }] }),
    ];
    const unmatched = unmatchedItems(snapshot(issues), [dashboard], {
      ...EVERYONE,
      query: { filter: "has:pr" },
    });
    expect(unmatched.items.map(numberOf)).toEqual([1]);
  });

  it("offers every unmatched item's labels and repos, filtered out or not, once per label", () => {
    const dashboard = { ...DASHBOARD, swimlanes: [] };
    const issues = [
      makeIssue({ number: 1, repo: "acme/lib", labels: [label("Bug")] }),
      makeIssue({ number: 2, kind: "pr", labels: [label("bug")] }),
    ];
    const { offer } = unmatchedItems(snapshot(issues), [dashboard], {
      ...EVERYONE,
      query: { filter: "is:pr" },
    });
    expect(offer.labels).toEqual(["Bug"]);
    expect(offer.repos).toEqual(["acme/app", "acme/lib"]);
  });
});

const INBOX: InboxDashboard = {
  type: "inbox",
  id: "inbox",
  name: "Inbox",
  filter: "",
  sort: { by: "updated", dir: "desc" },
  closedDays: 0,
  groups: [
    { id: "fix", name: "Fix", filter: "is:pr is:ci:failed", collapsed: false },
    { id: "bugs", name: "Bugs", filter: "label:bug", collapsed: true },
  ],
};

const grouped = (inbox: ReturnType<typeof buildInbox>) =>
  Object.fromEntries(Object.entries(inbox.groups).map(([id, cards]) => [id, cards.map(numberOf)]));

describe("buildInbox", () => {
  const issues = [
    makeIssue({ number: 1, kind: "pr", statuses: ["is:ci:failed"], labels: [label("bug")] }),
    makeIssue({ number: 2, labels: [label("bug"), label("ui")] }),
    makeIssue({ number: 3, labels: [label("bug")] }),
    makeIssue({ number: 4 }),
    makeIssue({ number: 5, labels: [label("bug")], state: "CLOSED" }),
  ];

  it("puts each item in the first group it matches, in sort order, dropping the rest", () => {
    const inbox = buildInbox(snapshot(issues), INBOX, EVERYONE);
    expect(grouped(inbox)).toEqual({ fix: [1], bugs: [3, 2] });
    expect(inbox.total).toBe(3);
  });

  it("keeps items closed within the window, matched by is:closed", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    const all = [
      ...issues,
      makeIssue({ number: 6, state: "CLOSED", closedAt: "2026-05-08T00:00:00Z" }),
      makeIssue({ number: 7, state: "CLOSED", closedAt: "2026-05-01T00:00:00Z" }),
    ];
    const groups = [{ id: "done", name: "Done", filter: "is:closed", collapsed: false }];
    const inbox = buildInbox(
      snapshot(all),
      { ...INBOX, closedDays: 7, groups },
      { ...EVERYONE, now },
    );
    expect(grouped(inbox)).toEqual({ done: [6] });
    expect(grouped(buildInbox(snapshot(all), { ...INBOX, groups }, { ...EVERYONE, now }))).toEqual({
      done: [],
    });
  });

  it("gives `other` whatever reaches its group", () => {
    const groups = [
      ...INBOX.groups,
      { id: "rest", name: "Rest", filter: "other", collapsed: false },
    ];
    expect(grouped(buildInbox(snapshot(issues), { ...INBOX, groups }, EVERYONE)).rest).toEqual([4]);
  });

  it("applies the dashboard filter, URL filters, sort and hidden repos", () => {
    const lib = makeIssue({ number: 6, repo: "acme/lib", labels: [label("bug")] });
    const all = [...issues, lib];
    const scoped = { ...INBOX, filter: "-is:pr" };
    expect(grouped(buildInbox(snapshot(all), scoped, EVERYONE))).toEqual({
      fix: [],
      bugs: [6, 3, 2],
    });
    expect(
      grouped(buildInbox(snapshot(all), scoped, { ...EVERYONE, query: { label: "ui" } })),
    ).toEqual({
      fix: [],
      bugs: [2],
    });
    const hidden = buildInbox(snapshot(all), scoped, {
      ...EVERYONE,
      query: { dir: "asc", hide: ["acme/lib"] },
    });
    expect(grouped(hidden).bugs).toEqual([2, 3]);
    expect(hidden.repos).toEqual(["acme/app", "acme/lib"]);
  });

  it("strips the labels groups ask for from cards and filter options", () => {
    const inbox = buildInbox(snapshot(issues), INBOX, EVERYONE);
    expect(inbox.labels).toEqual(["ui"]);
    expect(asIssue(inbox.groups.bugs?.find((card) => numberOf(card) === 2))?.labels).toEqual([
      label("ui"),
    ]);
  });

  it("groups failed CI jobs like issues and offers their names", () => {
    const groups = [
      { id: "ci", name: "CI", filter: "is:ci-job job:lint", collapsed: false },
      ...INBOX.groups,
    ];
    const jobs = [makeJob({ name: "lint" }), makeJob({ name: "test" })];
    const inbox = buildInbox(snapshot(issues, jobs), { ...INBOX, groups }, EVERYONE);
    expect(grouped(inbox)).toEqual({ ci: ["lint"], fix: [1], bugs: [3, 2] });
    expect(inbox.jobs).toEqual(["lint", "test"]);
    const filtered = buildInbox(
      snapshot(issues, jobs),
      { ...INBOX, groups },
      { ...EVERYONE, query: { job: "lint" } },
    );
    expect(grouped(filtered)).toEqual({ ci: ["lint"], fix: [], bugs: [] });
  });

  it("counts inbox groups as placing items in the unmatched view", () => {
    expect(unmatchedItems(snapshot(issues), [INBOX], EVERYONE).items.map(numberOf)).toEqual([4]);
    expect(
      unmatchedItems(snapshot(issues), [{ ...INBOX, groups: [] }], EVERYONE).items,
    ).toHaveLength(4);
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
    const board = buildBoard(snapshot(issues), DASHBOARD, EVERYONE);
    expect(board.cells[cell("high", "doing")]?.map(numberOf)).toEqual([1]);
    expect(board.cells[cell("low", "todo")]?.map(numberOf)).toEqual([2]);
    expect(board.cells[cell("rest", "done")]?.map(numberOf)).toEqual([3]);
    expect(board.cells[cell("rest", "todo")]?.map(numberOf)).toEqual([4]);
    expect(board.laneTotals).toEqual({ high: 1, low: 1, rest: 2 });
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
    const board = buildBoard(snapshot(issues), dashboard, EVERYONE);
    expect(board.cells[cell("rest", "waiting")]?.map(numberOf)).toEqual([1]);
    expect(board.cells[cell("rest", "doing")]?.map(numberOf)).toEqual([2, 1]);
    expect(board.cells[cell("rest", "todo")]?.map(numberOf)).toEqual([3]);
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
      numbers(buildBoard(snapshot(issues), DASHBOARD, { users: list, viewer }));
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
    const mine = buildBoard(snapshot(issues), dashboard, { users: ["@me"], viewer: "me" });
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
    const board = buildBoard(snapshot(issues), dashboard, EVERYONE);
    const lane = (id: string) => board.cells[cell(id, "todo")]?.map(numberOf);
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
    const board = buildBoard(snapshot(issues), dashboard, EVERYONE);
    const column = (id: string) => board.cells[cell("rest", id)]?.map(numberOf);
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
    const board = buildBoard(snapshot(issues), dashboard, EVERYONE);
    expect(board.cells[cell("prs", "todo")]?.map(numberOf)).toEqual([1]);
    expect(board.cells[cell("high", "todo")]?.map(numberOf)).toEqual([2, 1]);
  });

  it("shows an issue in every lane and column it matches, counting it once", () => {
    const issues = [
      makeIssue({
        number: 1,
        labels: [label("prio:high"), label("prio:low"), label("phase:doing"), label("phase:done")],
      }),
    ];
    const board = buildBoard(snapshot(issues), DASHBOARD, EVERYONE);
    for (const lane of ["high", "low"])
      for (const column of ["doing", "done"])
        expect(board.cells[cell(lane, column)]?.map(numberOf)).toEqual([1]);
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
    const board = buildBoard(snapshot(issues), dashboard, EVERYONE);
    expect(board.cells[cell("fix", "todo")]?.map(numberOf)).toEqual([3, 2, 1]);
    expect(board.cells[cell("fix", "todo")]?.map((c) => asIssue(c)?.statuses)).toEqual([
      ["is:unanswered"],
      ["is:ci:failed"],
      ["is:conflicting"],
    ]);
    expect(numbers(board)).toEqual([5, 4]);
  });

  it("matches has:pr on issues an open PR closes, whoever's the PR", () => {
    const dashboard = {
      ...DASHBOARD,
      swimlanes: [
        { id: "review", name: "In review", filter: "is:issue has:pr", hideBlocked: false },
        ...DASHBOARD.swimlanes,
      ],
    };
    const alice = { author: "alice" };
    const issues = [
      makeIssue({ number: 1, ...alice }),
      makeIssue({ number: 2, ...alice }),
      makeIssue({ number: 3, ...alice }),
      makeIssue({ number: 4, ...alice, labels: [label("has:pr")] }),
      makeIssue({ number: 10, kind: "pr", author: "bob", linked: [{ repo: REPO, number: 1 }] }),
      makeIssue({
        number: 11,
        kind: "pr",
        state: "CLOSED",
        linked: [{ repo: REPO, number: 2 }],
      }),
    ];
    const board = buildBoard(snapshot(issues), dashboard, { ...EVERYONE, users: ["alice"] });
    expect(
      board.cells[cell("review", "todo")]?.map((c) => [numberOf(c), asIssue(c)?.hasPr]),
    ).toEqual([[1, true]]);
  });

  it("shows items closed within the window, which count for nothing open", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    const recently = { state: "CLOSED" as const, closedAt: "2026-05-09T00:00:00Z" };
    const issues = [
      makeIssue({ number: 1 }),
      makeIssue({ number: 2, ...recently }),
      makeIssue({ number: 3, state: "CLOSED", closedAt: "2026-04-01T00:00:00Z" }),
      makeIssue({ number: 4, state: "CLOSED", closedAt: null }),
      makeIssue({ number: 5, kind: "pr", ...recently, linked: [{ repo: REPO, number: 1 }] }),
    ];
    const dashboard = {
      ...DASHBOARD,
      closedDays: 7,
      columns: [
        { id: "todo", name: "Todo", filter: "other" },
        { id: "done", name: "Done", filter: "is:closed" },
      ],
    };
    const board = buildBoard(snapshot(issues), dashboard, { ...EVERYONE, now });
    expect(board.cells[cell("rest", "done")]?.map(numberOf)).toEqual([5, 2]);
    expect(board.cells[cell("rest", "done")]?.map((c) => asIssue(c)?.state)).toEqual([
      "CLOSED",
      "CLOSED",
    ]);
    expect(asIssue(board.cells[cell("rest", "todo")]?.[0])).toMatchObject({
      number: 1,
      hasPr: false,
    });
    const openOnly = buildBoard(
      snapshot(issues),
      { ...dashboard, closedDays: 0 },
      { ...EVERYONE, now },
    );
    expect(openOnly.total).toBe(1);
  });

  it("leaves out issues that fit no group when an axis has no catch-all", () => {
    const dashboard = {
      ...DASHBOARD,
      columns: [{ id: "doing", name: "Doing", filter: "label:phase:doing" }],
    };
    const board = buildBoard(snapshot([makeIssue({ number: 1 })]), dashboard, EVERYONE);
    expect(board.total).toBe(0);
    expect(board.laneTotals.rest).toBe(0);
  });

  it("hides blocked issues only in lanes that ask for it", () => {
    const blockedBy = [{ repo: REPO, number: 9, state: "OPEN" as const }];
    const issues = [
      makeIssue({ number: 1, labels: [label("prio:high")], blockedBy, blockedByTotal: 1 }),
      makeIssue({ number: 2, labels: [label("prio:low")], blockedBy, blockedByTotal: 1 }),
      makeIssue({ number: 9 }),
    ];
    const board = buildBoard(snapshot(issues), DASHBOARD, EVERYONE);
    expect(board.cells[cell("high", "todo")]?.[0]).toMatchObject({ number: 1, blocked: true });
    expect(board.cells[cell("low", "todo")]).toEqual([]);
    expect(board.hiddenBlocked).toEqual({ high: 0, low: 1, rest: 0 });
  });

  it("never counts a closed issue as blocked", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    const issues = [
      makeIssue({
        number: 1,
        labels: [label("prio:low")],
        state: "CLOSED",
        closedAt: "2026-05-09T00:00:00Z",
        blockedBy: waitsOn(9),
        blockedByTotal: 1,
      }),
      makeIssue({ number: 9 }),
    ];
    const dashboard = { ...DASHBOARD, closedDays: 7 };
    const board = buildBoard(snapshot(issues), dashboard, { ...EVERYONE, now });
    expect(board.cells[cell("low", "todo")]?.[0]).toMatchObject({ number: 1, blocked: false });
    expect(board.hiddenBlocked.low).toBe(0);
  });

  it("never counts a closed issue as blocking or as having a PR", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    const recently = { state: "CLOSED" as const, closedAt: "2026-05-09T00:00:00Z" };
    const issues = [
      makeIssue({ number: 1, blockedBy: waitsOn(2), blockedByTotal: 1 }),
      makeIssue({ number: 2, ...recently }),
      makeIssue({ number: 3, ...recently }),
      makeIssue({ number: 4, kind: "pr", linked: [{ repo: REPO, number: 3 }] }),
    ];
    const dashboard = {
      ...DASHBOARD,
      closedDays: 7,
      columns: [
        { id: "blocking", name: "Blocking", filter: "is:blocking" },
        { id: "review", name: "Review", filter: "has:pr" },
        { id: "rest", name: "Rest", filter: "other" },
      ],
    };
    const board = buildBoard(snapshot(issues), dashboard, { ...EVERYONE, now });
    expect(board.cells[cell("rest", "blocking")]).toEqual([]);
    expect(board.cells[cell("rest", "review")]).toEqual([]);
    expect(board.cells[cell("rest", "rest")]?.map(numberOf)).toEqual(
      expect.arrayContaining([2, 3]),
    );
  });

  it("drops a closed PR's statuses, which no longer refresh", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    const statuses = ["is:ci:failed" as const];
    const issues = [
      makeIssue({ number: 1, kind: "pr", statuses }),
      makeIssue({
        number: 2,
        kind: "pr",
        statuses,
        state: "CLOSED",
        closedAt: "2026-05-09T00:00:00Z",
      }),
    ];
    const dashboard = {
      ...DASHBOARD,
      closedDays: 7,
      columns: [
        { id: "failing", name: "Failing", filter: "is:ci:failed" },
        { id: "rest", name: "Rest", filter: "other" },
      ],
    };
    const board = buildBoard(snapshot(issues), dashboard, { ...EVERYONE, now });
    expect(board.cells[cell("rest", "failing")]?.map(numberOf)).toEqual([1]);
    expect(asIssue(board.cells[cell("rest", "rest")]?.[0])).toMatchObject({
      number: 2,
      statuses: [],
    });
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
    const board = buildBoard(snapshot(issues), DASHBOARD, EVERYONE);
    expect(board.cells[cell("low", "todo")]?.[0]).toMatchObject({ number: 2, blocked: false });
  });

  it("strips structural labels from cards and filter options", () => {
    const issue = makeIssue({
      number: 1,
      labels: [label("prio:high"), label("phase:doing"), label("bug"), label("epic")],
      assignees: [{ login: "ann", avatarUrl: "" }],
    });
    const board = buildBoard(snapshot([issue]), DASHBOARD, EVERYONE);
    const card = asIssue(board.cells[cell("high", "doing")]?.[0]);
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
    const board = buildBoard(snapshot(issues), DASHBOARD, EVERYONE);
    expect(board.epics.map((epic) => epic.number)).toEqual([2, 1]);
    expect(asIssue(board.cells[cell("high", "todo")]?.[0])?.labels.map((l) => l.name)).toEqual([
      "Bug",
    ]);
    expect(board.labels).toEqual(["Bug"]);
    expect(shown(issues, { label: "BUG" })).toEqual([3]);
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
    const board = buildBoard(snapshot(issues), dashboard, { ...EVERYONE, viewer: "me" });
    expect(board.cells[cell("blocking", "todo")]?.map(numberOf)).toEqual([1]);
    expect(board.cells[cell("mine", "todo")]?.map(numberOf)).toEqual([5]);
    expect(numbers(board)).toEqual([3, 2]);
  });

  it("sorts cells by the dashboard sort, overridable per request", () => {
    const issues = [makeIssue({ number: 1 }), makeIssue({ number: 3 }), makeIssue({ number: 2 })];
    const byDefault = buildBoard(snapshot(issues), DASHBOARD, EVERYONE);
    expect(byDefault.cells[cell("rest", "todo")]?.map(numberOf)).toEqual([3, 2, 1]);
    const asc = buildBoard(snapshot(issues), DASHBOARD, {
      ...EVERYONE,
      query: { sort: "created", dir: "asc" },
    });
    expect(asc.cells[cell("rest", "todo")]?.map(numberOf)).toEqual([1, 2, 3]);
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
    expect(shown(issues, { q: "login" })).toEqual([2, 1]);
    expect(shown(issues, { q: "3" })).toEqual([3]);
    expect(shown(issues, { assignee: "ann" })).toEqual([3, 1]);
    expect(shown(issues, { label: "bug" })).toEqual([2, 1]);
    expect(shown(issues, { epic: "acme/app#10" })).toEqual([1]);
    expect(shown(issues, { q: "login", assignee: "ann" })).toEqual([1]);
  });

  it("filters by issue type in any case, which hides every PR and CI job", () => {
    const issues = [
      makeIssue({ number: 1, issueType: "Bug" }),
      makeIssue({ number: 2, issueType: "Task" }),
      makeIssue({ number: 3 }),
      makeIssue({ number: 4, issueType: "Bug" }),
      makeIssue({ number: 5, kind: "pr" }),
    ];
    const board = buildBoard(snapshot(issues, [makeJob({ name: "lint" })]), DASHBOARD, {
      ...EVERYONE,
      query: { type: "BUG" },
    });
    expect(numbers(board)).toEqual([4, 1]);
  });

  it("offers each issue type once, in the first spelling seen", () => {
    const issues = [
      makeIssue({ number: 1, issueType: "Bug" }),
      makeIssue({ number: 2, issueType: "Task" }),
      makeIssue({ number: 3, issueType: "bug" }),
    ];
    const board = buildBoard(snapshot(issues, [makeJob({ name: "lint" })]), DASHBOARD, EVERYONE);
    expect(board.types).toEqual(["Bug", "Task"]);
  });

  it("shows each issue's type on its card", () => {
    const issues = [
      makeIssue({ number: 1, issueType: "Bug" }),
      makeIssue({ number: 2, issueType: "Task" }),
      makeIssue({ number: 3 }),
      makeIssue({ number: 4, issueType: "Bug" }),
    ];
    const board = buildBoard(snapshot(issues), DASHBOARD, EVERYONE);
    const cards = board.cells[cell("rest", "todo")]!;
    expect(cards.map((c) => c.kind !== "ci-job" && c.issueType)).toEqual([
      "Bug",
      null,
      "Task",
      "Bug",
    ]);
  });

  it("places pull requests next to issues and never lists them as epics", () => {
    const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2, kind: "pr" })];
    const board = buildBoard(snapshot(issues), DASHBOARD, EVERYONE);
    expect(board.cells[cell("rest", "todo")]?.map((c) => c.kind)).toEqual(["pr", "issue"]);
    const epicPr = makeIssue({ number: 3, kind: "pr", labels: [label("epic")] });
    expect(buildBoard(snapshot([epicPr]), DASHBOARD, EVERYONE).epics).toEqual([]);
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
    expect(shown(issues, { epic: "acme/app#10" })).toEqual([3, 2, 1]);
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
    expect(shown(issues, { epic: "acme/app#10" })).toEqual([3, 2, 1]);
  });

  it("counts the open PRs closing an epic or an issue related to it", () => {
    const epic = { repo: REPO, number: 10 };
    const issues = [
      makeIssue({ number: 1, parent: epic }),
      makeIssue({ number: 2 }),
      makeIssue({ number: 3 }),
      makeIssue({
        number: 10,
        labels: [label("epic")],
        blockedBy: [{ repo: REPO, number: 2, state: "OPEN" }],
        blockedByTotal: 1,
      }),
      makeIssue({ number: 11, labels: [label("epic")] }),
      prFor(20, 1),
      prFor(21, 2),
      prFor(22, 1, "CLOSED"),
      prFor(23, 3),
      prFor(24, 10),
      makeIssue({
        number: 25,
        kind: "pr",
        statuses: ["is:draft"],
        linked: [{ repo: REPO, number: 1 }],
      }),
      makeIssue({
        number: 26,
        kind: "pr",
        repo: "acme/other",
        linked: [{ repo: REPO, number: 1 }],
      }),
    ];
    const epics = buildBoard(snapshot(issues), DASHBOARD, {
      ...EVERYONE,
      query: { hide: ["acme/other"] },
    }).epics;
    expect(epics.map((e) => [e.number, e.openPrs])).toEqual([
      [11, 0],
      [10, 4],
    ]);
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
    const board = buildBoard(snapshot(issues), DASHBOARD, {
      ...EVERYONE,
      query: { q: "nothing matches" },
    });
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
    const epics = buildBoard(snapshot(issues), DASHBOARD, { ...EVERYONE, starred }).epics;
    expect(epics.map((epic) => [epic.number, epic.starred])).toEqual([
      [12, true],
      [10, true],
      [13, false],
      [11, false],
    ]);
  });

  it("hides epics from hidden repos", () => {
    const issues = [
      makeIssue({ number: 10, labels: [label("epic")] }),
      makeIssue({ number: 11, repo: "acme/other", labels: [label("epic")] }),
    ];
    const board = buildBoard(snapshot(issues), DASHBOARD, { ...EVERYONE, query: { hide: [REPO] } });
    expect(board.epics.map((epic) => epic.key)).toEqual(["acme/other#11"]);
  });

  it("leaves closed epics out of the strip, starred or not, but keeps their cards", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    const closed = {
      state: "CLOSED" as const,
      closedAt: "2026-05-09T00:00:00Z",
      labels: [label("epic")],
    };
    const issues = [
      makeIssue({ number: 10, ...closed }),
      makeIssue({ number: 11, ...closed }),
      makeIssue({ number: 12, labels: [label("epic")] }),
    ];
    const board = buildBoard(
      snapshot(issues),
      { ...DASHBOARD, closedDays: 7 },
      {
        ...EVERYONE,
        starred: new Set(["acme/app#10"]),
        now,
      },
    );
    expect(board.epics.map((epic) => epic.number)).toEqual([12]);
    expect(numbers(board)).toEqual(expect.arrayContaining([10, 11, 12]));
  });

  it("keeps a closed epic in the strip while it is the epic filter", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    const closed = {
      state: "CLOSED" as const,
      closedAt: "2026-05-09T00:00:00Z",
      labels: [label("epic")],
    };
    const issues = [
      makeIssue({ number: 10, ...closed }),
      makeIssue({ number: 11, ...closed }),
      makeIssue({ number: 12, labels: [label("epic")] }),
    ];
    const board = buildBoard(
      snapshot(issues),
      { ...DASHBOARD, closedDays: 7 },
      { ...EVERYONE, query: { epic: "acme/app#10" }, now },
    );
    expect(board.epics.map((epic) => epic.number)).toEqual([12, 10]);
  });

  it("ignores hidden repos not on the dashboard", () => {
    const issues = [
      makeIssue({ number: 1 }),
      makeIssue({ number: 10, repo: "acme/other", labels: [label("epic")] }),
    ];
    const board = buildBoard(snapshot(issues), DASHBOARD, {
      ...EVERYONE,
      query: { hide: ["acme/gone"] },
    });
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
    const board = buildBoard(snapshot(issues), dashboard, { ...EVERYONE, viewer: "me" });
    expect(numbers(board)).toEqual([3, 2]);
    expect(board.epics.map((epic) => epic.key)).toEqual(["acme/other#3"]);
    expect(asIssue(board.cells[cell("rest", "todo")]?.[1])?.labels).toEqual([]);
    expect(board.repos).toEqual(["acme/app", "acme/other"]);
  });

  it("lists the repos among the dashboard's items, shown or not", () => {
    const issues = [
      makeIssue({ number: 1, repo: "acme/b" }),
      makeIssue({ number: 2, repo: "acme/a" }),
      makeIssue({ number: 3, repo: "acme/c", state: "CLOSED" }),
    ];
    expect(
      buildBoard(snapshot(issues), DASHBOARD, { ...EVERYONE, query: { hide: ["acme/b"] } }).repos,
    ).toEqual(["acme/a", "acme/b"]);
  });

  it("hides repos switched off in the nav", () => {
    const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2, repo: "acme/other" })];
    const hide = ["acme/other", "acme/gone"];
    expect(shown(issues, { hide })).toEqual([1]);
    expect(shown(issues, { hide: [REPO, "acme/other"] })).toEqual([]);
  });

  it("skips epics when no epic label is configured", () => {
    const dashboard = { ...DASHBOARD, epicLabel: undefined };
    const board = buildBoard(
      snapshot([makeIssue({ number: 1, labels: [label("epic")] })]),
      dashboard,
      EVERYONE,
    );
    expect(board.epics).toEqual([]);
    expect(asIssue(board.cells[cell("rest", "todo")]?.[0])?.labels.map((l) => l.name)).toEqual([
      "epic",
    ]);
  });
});

const jobs = [
  makeJob({ name: "test" }),
  makeJob({ name: "lint", branch: "fix/y", authors: ["bob"] }),
];
/** Names of the job cards in the catch-all cell under `query`. */
const shownJobs = (query: ViewQuery) =>
  buildBoard(snapshot([], jobs), DASHBOARD, { ...EVERYONE, query }).cells[
    cell("rest", "todo")
  ]?.map(numberOf);

describe("CI jobs", () => {
  it("lands on the grid like an issue, sorted with the issues", () => {
    const board = buildBoard(snapshot([makeIssue({ number: 1 })], jobs), DASHBOARD, EVERYONE);
    expect(board.cells[cell("rest", "todo")]?.map(numberOf)).toEqual(["test", "lint", 1]);
    expect(board.total).toBe(3);
    expect(board.cells[cell("rest", "todo")]?.[0]).toMatchObject({
      kind: "ci-job",
      branch: "feat/x",
      failedAt: "2026-02-15T00:00:00Z",
    });
  });

  it("shows only the jobs of branches the global users have commits in", () => {
    const mine = buildBoard(snapshot([], jobs), DASHBOARD, { users: ["@me"], viewer: "bob" });
    expect(mine.cells[cell("rest", "todo")]?.map(numberOf)).toEqual(["lint"]);
  });

  it("follows the dashboard filter and the swimlanes", () => {
    const lanes = [
      { id: "ci", name: "CI", filter: "is:ci-job job:lint", hideBlocked: false },
      { id: "rest", name: "Rest", filter: "other", hideBlocked: false },
    ];
    const board = buildBoard(snapshot([], jobs), { ...DASHBOARD, swimlanes: lanes }, EVERYONE);
    expect(board.cells[cell("ci", "todo")]?.map(numberOf)).toEqual(["lint"]);
    const scoped = { ...DASHBOARD, filter: "-is:ci-job" };
    expect(buildBoard(snapshot([], jobs), scoped, EVERYONE).total).toBe(0);
  });

  it("matches the text filter on job and branch names, and no other filter", () => {
    expect(shownJobs({ q: "FIX/" })).toEqual(["lint"]);
    expect(shownJobs({ q: "test" })).toEqual(["test"]);
    expect(shownJobs({ assignee: "bob" })).toEqual([]);
    expect(shownJobs({ epic: "acme/app#1" })).toEqual([]);
    expect(shownJobs({ hide: [REPO] })).toEqual([]);
  });

  it("filters by job name in any case, which hides every issue, and lists the names", () => {
    const issues = [makeIssue({ number: 1 })];
    const board = buildBoard(snapshot(issues, jobs), DASHBOARD, {
      ...EVERYONE,
      query: { job: "LINT" },
    });
    expect(board.cells[cell("rest", "todo")]?.map(numberOf)).toEqual(["lint"]);
    expect(board.jobs).toEqual(["lint", "test"]);
  });

  it("takes its open PR's labels for filters, facets and the card", () => {
    const pr = makeIssue({ number: 7, kind: "pr", labels: [label("team-a"), label("bug")] });
    const withPr = [makeJob({ name: "lint", pr: { number: 7, url: pr.url } }), ...jobs];
    const lanes = [
      { id: "a", name: "A", filter: "label:team-a", hideBlocked: false },
      { id: "rest", name: "Rest", filter: "other", hideBlocked: false },
    ];
    const dashboard = { ...DASHBOARD, swimlanes: lanes, filter: "is:ci-job" };
    const board = buildBoard(snapshot([pr], withPr), dashboard, EVERYONE);
    expect(board.cells[cell("a", "todo")]?.map(numberOf)).toEqual(["lint"]);
    expect(board.cells[cell("a", "todo")]?.[0]?.labels.map((l) => l.name)).toEqual(["bug"]);
    expect(board.labels).toEqual(["bug"]);
    const filtered = buildBoard(snapshot([pr], withPr), dashboard, {
      ...EVERYONE,
      query: { label: "BUG" },
    });
    expect(filtered.total).toBe(1);
  });

  it("takes no labels from a closed PR", () => {
    const pr = makeIssue({ number: 7, kind: "pr", state: "CLOSED", labels: [label("bug")] });
    const withPr = [makeJob({ name: "lint", pr: { number: 7, url: pr.url } })];
    const dashboard = { ...DASHBOARD, filter: "is:ci-job" };
    const board = buildBoard(snapshot([pr], withPr), dashboard, EVERYONE);
    expect(board.labels).toEqual([]);
  });

  it("lists a job no dashboard places as unmatched", () => {
    const issuesOnly = { ...DASHBOARD, filter: "-is:ci-job" };
    const unmatched = unmatchedItems(snapshot([], jobs), [issuesOnly], {
      ...EVERYONE,
      users: ["bob"],
    }).items;
    expect(unmatched.map(numberOf)).toEqual(["lint"]);
  });
});
