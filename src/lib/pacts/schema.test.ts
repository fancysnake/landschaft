import { describe, expect, it } from "vitest";

import { closedSince, ConfigSchema, reposToResync } from "./schema";

describe("hidden repos", () => {
  it("loads a config without them with every repo on", () => {
    expect(ConfigSchema.parse({ repos: ["acme/a"] }).hiddenRepos).toEqual([]);
  });

  it("drops a hidden repo that is no longer configured", () => {
    const config = ConfigSchema.parse({ repos: ["acme/a"], hiddenRepos: ["acme/a", "acme/b"] });
    expect(config.hiddenRepos).toEqual(["acme/a"]);
  });
});

describe("closedSince", () => {
  const now = new Date("2026-05-10T00:00:00Z");

  it("goes back the window's days from now", () => {
    expect(closedSince(7, now)).toBe(Date.parse("2026-05-03T00:00:00Z"));
  });

  it("keeps nothing closed for an empty window", () => {
    expect(closedSince(0, now)).toBe(Number.POSITIVE_INFINITY);
  });
});

const config = (repos: string[], ...windows: number[]) => ({
  repos,
  dashboards: windows.map((closedDays) => ({ closedDays })),
});

describe("reposToResync", () => {
  it("resyncs every repo when the closed window grew", () => {
    expect(reposToResync(config(["acme/a"], 0, 3), config(["acme/a", "acme/b"], 7))).toEqual([
      "acme/a",
      "acme/b",
    ]);
  });

  it("resyncs only the added repos otherwise", () => {
    expect(reposToResync(config(["acme/a"], 7), config(["acme/a", "acme/b"], 3))).toEqual([
      "acme/b",
    ]);
    expect(reposToResync(config(["acme/a"], 7), config(["acme/a"], 7))).toEqual([]);
  });
});
