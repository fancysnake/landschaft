import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigSchema } from "../schema";
import { allRepos, findDashboard, loadConfig, refreshMinutesByRepo, saveConfig } from "./config";

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

  it("returns an empty config when the file is missing", () => {
    expect(loadConfig(file)).toEqual({ dashboards: [] });
  });

  it("round-trips through save and load with defaults filled in", () => {
    const saved = saveConfig(minimal, file);
    expect(saved.dashboards[0]).toMatchObject({
      sort: { by: "updated", dir: "desc" },
      refreshMinutes: 5,
      users: ["@me"],
      swimlanes: [{ id: "all", labels: [], match: "any", kind: "any", hideBlocked: false }],
      columns: [{ id: "todo", labels: [], match: "any", kind: "any" }],
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

const withLaneLabels = (labels: string[]) => ({
  dashboards: [{ ...minimal.dashboards[0]!, swimlanes: [{ id: "a", name: "A", labels }] }],
});

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

  it("rejects two catch-alls on one axis", () => {
    const twoCatchAlls = {
      dashboards: [
        {
          ...base,
          columns: [
            { id: "a", name: "A" },
            { id: "b", name: "B" },
          ],
        },
      ],
    };
    expect(() => saveConfig(twoCatchAlls, "/dev/null/never")).toThrow(/catch-all/);
  });

  it("takes the PR status labels but no other is: label", () => {
    expect(ConfigSchema.safeParse(withLaneLabels(["is:ci:failed", "bug"])).success).toBe(true);
    for (const typo of ["is:conflict", "is:pr"])
      expect(() => saveConfig(withLaneLabels([typo]), "/dev/null/never")).toThrow(
        /not a PR status label/,
      );
  });

  it("does not count a kind-only swimlane or column as a catch-all", () => {
    const prLane = {
      dashboards: [
        {
          ...base,
          swimlanes: [
            { id: "prs", name: "PRs", kind: "pr" },
            { id: "rest", name: "Rest" },
          ],
          columns: [
            { id: "issues", name: "Issues", kind: "issue" },
            { id: "rest", name: "Rest" },
          ],
        },
      ],
    };
    const parsed = ConfigSchema.parse(prLane).dashboards[0]!;
    expect(parsed.swimlanes[0]!.kind).toBe("pr");
    expect(parsed.columns[0]!.kind).toBe("issue");
  });

  it("rejects malformed repo names", () => {
    const bad = { dashboards: [{ ...base, repos: ["not a repo"] }] };
    expect(() => saveConfig(bad, "/dev/null/never")).toThrow(/owner\/repo/);
  });

  it("reads the legacy scope as users", () => {
    expect(parseDashboard({ scope: "mine" })).toMatchObject({ users: ["@me"] });
    expect(parseDashboard({ scope: "all" })).toMatchObject({ users: [] });
    expect(parseDashboard({ scope: "all", users: ["ann"] })).toMatchObject({ users: ["ann"] });
    expect(parseDashboard({ scope: "all" })).not.toHaveProperty("scope");
  });

  it("takes GitHub logins and @me as users", () => {
    const ok = { dashboards: [{ ...base, users: ["@me", "ann-b", "renovate[bot]"] }] };
    expect(ConfigSchema.safeParse(ok).success).toBe(true);
    for (const bad of ["@ann", "ann b", "-ann", ""])
      expect(() =>
        saveConfig({ dashboards: [{ ...base, users: [bad] }] }, "/dev/null/never"),
      ).toThrow(/GitHub login/);
  });
});

describe("config helpers", () => {
  const config = saveConfig(minimal, join(mkdtempSync(join(tmpdir(), "landschaft-")), "c.json"));

  it("finds dashboards and unique repos", () => {
    expect(findDashboard(config, "fast")?.name).toBe("Fast");
    expect(findDashboard(config, "nope")).toBeUndefined();
    expect(allRepos(config)).toEqual(["acme/app", "acme/lib"]);
  });

  it("uses the smallest refresh interval per repo", () => {
    expect([...refreshMinutesByRepo(config)]).toEqual([
      ["acme/app", 5],
      ["acme/lib", 1],
    ]);
  });
});
