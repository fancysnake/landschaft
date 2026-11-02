import { describe, expect, it } from "vitest";

import { closedSince, ConfigSchema } from "./config";

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
