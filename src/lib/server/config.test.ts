import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigSchema } from "../schema";
import { findDashboard, loadConfig, saveConfig } from "./config";

const minimal = {
  dashboards: [
    {
      id: "main",
      name: "Main",
      repos: ["acme/app", "acme/lib"],
      swimlanes: [{ id: "all", name: "All" }],
      columns: [{ id: "todo", name: "Todo" }],
    },
    {
      id: "fast",
      name: "Fast",
      repos: ["acme/lib"],
      refreshMinutes: 1,
      swimlanes: [{ id: "all", name: "All" }],
      columns: [{ id: "todo", name: "Todo" }],
    },
  ],
};

describe("config file", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "landschaft-"));
    file = join(dir, "nested", "landschaft.config.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads the example config", () => {
    expect(loadConfig("landschaft.config.example.json").dashboards).toHaveLength(1);
  });

  it("returns an empty config when the file is missing", () => {
    expect(loadConfig(file)).toEqual({ repos: [], users: [], refreshMinutes: 5, dashboards: [] });
  });

  it("round-trips through save and load with defaults filled in", () => {
    const saved = saveConfig(minimal, file);
    expect(saved.dashboards[0]).toMatchObject({
      sort: { by: "updated", dir: "desc" },
      filter: "",
      swimlanes: [{ id: "all", filter: "other", hideBlocked: false }],
      columns: [{ id: "todo", filter: "other" }],
    });
    expect(loadConfig(file)).toEqual(saved);
    expect(existsSync(`${file}.tmp`)).toBe(false);
    expect(readFileSync(file, "utf8").endsWith("\n")).toBe(true);
  });

  it("rejects invalid configs without touching the file", () => {
    saveConfig(minimal, file);
    const bad = {
      dashboards: [{ ...minimal.dashboards[0], columns: [] }],
    };
    expect(() => saveConfig(bad, file)).toThrow();
    expect(loadConfig(file).dashboards).toHaveLength(2);
  });
});

const parseDashboard = (extra: object) =>
  ConfigSchema.parse({ dashboards: [{ ...minimal.dashboards[0]!, ...extra }] }).dashboards[0]!;

const lane = (group: object) =>
  parseDashboard({ swimlanes: [{ id: "a", name: "A", ...group }] }).swimlanes[0];

const usersOf = (extra: object) =>
  ConfigSchema.parse({ dashboards: [{ ...minimal.dashboards[0]!, ...extra }] }).users;

const dashboard = (id: string, extra: object) => ({ ...minimal.dashboards[0]!, id, ...extra });

describe("config schema rules", () => {
  const base = minimal.dashboards[0]!;

  it("rejects duplicate ids", () => {
    const dup = { dashboards: [base, { ...base, name: "Copy" }] };
    expect(() => saveConfig(dup, "/dev/null/never")).toThrow(/unique/);
    const dupLanes = {
      dashboards: [
        {
          ...base,
          swimlanes: [
            { id: "x", name: "A" },
            { id: "x", name: "B" },
          ],
        },
      ],
    };
    expect(() => saveConfig(dupLanes, "/dev/null/never")).toThrow(/unique/);
  });

  const laneFiltered = (filter: string) => ({
    dashboards: [{ ...base, swimlanes: [{ id: "a", name: "A", filter }] }],
  });

  it("rejects a filter that does not parse, with the parser's message", () => {
    expect(ConfigSchema.safeParse(laneFiltered("is:ci:failed label:bug")).success).toBe(true);
    expect(() => saveConfig(laneFiltered("is:conflict"), "/dev/null/never")).toThrow(/is:conflict/);
    expect(() => saveConfig(laneFiltered("(label:a"), "/dev/null/never")).toThrow(/unclosed paren/);
  });

  it("migrates labels, match and kind into a filter", () => {
    expect(lane({ labels: ["a", "needs review"] })).toEqual({
      id: "a",
      name: "A",
      filter: 'label:a|"needs review"',
      hideBlocked: false,
    });
    expect(lane({ labels: ["a", "b"], match: "all" })?.filter).toBe("label:a label:b");
    expect(lane({ labels: ["bug", "is:ci:failed", "is:has-pr"] })?.filter).toBe(
      "label:bug OR is:ci:failed OR is:has-pr",
    );
    expect(lane({ labels: ["a", "is:unanswered"], kind: "pr" })?.filter).toBe(
      "is:pr (label:a OR is:unanswered)",
    );
    expect(lane({ labels: ["a", "b"], match: "all", kind: "issue" })?.filter).toBe(
      "is:issue label:a label:b",
    );
    expect(lane({ labels: ["x OR y"], match: "all", kind: "pr" })?.filter).toBe(
      'is:pr label:"x OR y"',
    );
    expect(lane({ labels: ["x OR y"], kind: "pr" })?.filter).toBe('is:pr label:"x OR y"');
    expect(lane({ kind: "pr" })?.filter).toBe("is:pr");
    expect(lane({ labels: [], match: "any", kind: "any" })?.filter).toBe("other");
    expect(lane({ filter: "label:x", labels: ["y"] })?.filter).toBe("label:x");
  });

  it("turns a legacy catch-all into `other` minus the entries it does not look at", () => {
    const swimlanes = [
      { id: "a", name: "A", labels: ["a"] },
      { id: "rest", name: "Rest" },
      { id: "b", name: "B", labels: ["b"] },
    ];
    const columns = [
      { id: "a", name: "A", labels: ["a"] },
      { id: "rest", name: "Rest" },
      { id: "b", name: "B", labels: ["b"], kind: "pr" },
      { id: "c", name: "C", filter: "" },
    ];
    const parsed = ConfigSchema.parse({ dashboards: [{ ...base, swimlanes, columns }] });
    expect(parsed.dashboards[0]?.swimlanes.map((group) => group.filter)).toEqual([
      "label:a",
      "other -(label:b)",
      "label:b",
    ]);
    expect(parsed.dashboards[0]?.columns.map((column) => column.filter)).toEqual([
      "label:a",
      "other -(label:a)",
      "is:pr label:b",
      "",
    ]);
  });

  it("rejects malformed repo names", () => {
    const bad = { dashboards: [{ ...base, repos: ["not a repo"] }] };
    expect(() => saveConfig(bad, "/dev/null/never")).toThrow(/owner\/repo/);
  });

  it("reads the legacy scope as users", () => {
    expect(usersOf({ scope: "mine" })).toEqual(["@me"]);
    expect(usersOf({ scope: "all" })).toEqual([]);
    expect(usersOf({ scope: "all", users: ["ann"] })).toEqual(["ann"]);
    expect(parseDashboard({ scope: "all" })).not.toHaveProperty("scope");
  });

  it("rejects `other` in a dashboard filter", () => {
    expect(() =>
      saveConfig(
        { repos: [], dashboards: [{ ...base, filter: "label:a -other" }] },
        "/dev/null/never",
      ),
    ).toThrow(/only works in swimlanes/);
    expect(parseDashboard({ filter: "repo:acme/app user:@me" }).filter).toBe(
      "repo:acme/app user:@me",
    );
  });

  it("takes GitHub logins and @me as users", () => {
    const ok = {
      dashboards: [
        { ...base, users: ["@me", "ann-b", "mona-cat_octo", "renovate[bot]", "renovate"] },
      ],
    };
    expect(ConfigSchema.safeParse(ok).success).toBe(true);
    for (const bad of ["@ann", "ann b", "-ann", ""])
      expect(() =>
        saveConfig({ dashboards: [{ ...base, users: [bad] }] }, "/dev/null/never"),
      ).toThrow(/GitHub login/);
  });
});

describe("global scope migration", () => {
  it("takes the unions and the shortest interval, narrowing dashboards that differ", () => {
    const config = ConfigSchema.parse(minimal);
    expect(config).toMatchObject({
      repos: ["acme/app", "acme/lib"],
      users: ["@me"],
      refreshMinutes: 1,
    });
    expect(config.dashboards.map((d) => d.filter)).toEqual(["", "repo:acme/lib"]);
    expect(config.dashboards[1]).not.toHaveProperty("repos");
    expect(config.dashboards[1]).not.toHaveProperty("refreshMinutes");
    const slow = minimal.dashboards.map((d) => ({ ...d, refreshMinutes: 10 }));
    expect(ConfigSchema.parse({ dashboards: slow }).refreshMinutes).toBe(10);
  });

  it("narrows users, and keeps users empty when any dashboard took everyone's", () => {
    const mixed = ConfigSchema.parse({
      dashboards: [dashboard("a", { users: ["ann"] }), dashboard("b", { users: ["ann", "bob"] })],
    });
    expect(mixed.users).toEqual(["ann", "bob"]);
    expect(mixed.dashboards.map((d) => d.filter)).toEqual(["user:ann", ""]);
    const everyone = ConfigSchema.parse({
      dashboards: [dashboard("a", { users: ["ann"] }), dashboard("b", { scope: "all" })],
    });
    expect(everyone.users).toEqual([]);
    expect(everyone.dashboards.map((d) => d.filter)).toEqual(["user:ann", ""]);
  });

  it("puts a filter already there in parens before the narrowing", () => {
    const config = ConfigSchema.parse({
      dashboards: [
        dashboard("a", { repos: ["acme/app"], filter: "label:a OR label:b" }),
        dashboard("b", { repos: ["acme/lib"] }),
      ],
    });
    expect(config.dashboards[0]?.filter).toBe("(label:a OR label:b) repo:acme/app");
  });

  it("leaves a config with global repos alone, dropping dashboard leftovers", () => {
    const config = ConfigSchema.parse({ ...minimal, repos: ["acme/app"] });
    expect(config).toMatchObject({ repos: ["acme/app"], users: [], refreshMinutes: 5 });
    expect(config.dashboards.map((d) => d.filter)).toEqual(["", ""]);
    expect(config.dashboards[0]).not.toHaveProperty("users");
  });
});

describe("config helpers", () => {
  const config = saveConfig(minimal, join(mkdtempSync(join(tmpdir(), "landschaft-")), "c.json"));

  it("finds dashboards", () => {
    expect(findDashboard(config, "fast")?.name).toBe("Fast");
    expect(findDashboard(config, "nope")).toBeUndefined();
  });
});
