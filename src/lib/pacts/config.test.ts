import { describe, expect, it } from "vitest";

import { ConfigSchema } from "./config";

describe("hidden repos", () => {
  it("loads a config without them with every repo on", () => {
    expect(ConfigSchema.parse({ repos: ["acme/a"] }).hiddenRepos).toEqual([]);
  });

  it("drops a hidden repo that is no longer configured", () => {
    const config = ConfigSchema.parse({ repos: ["acme/a"], hiddenRepos: ["acme/a", "acme/b"] });
    expect(config.hiddenRepos).toEqual(["acme/a"]);
  });
});
