import { describe, expect, it } from "vitest";

import { ConfigSchema } from "./config";

describe("hidden repos", () => {
  it("loads a config that still lists them, without the list", () => {
    const config = ConfigSchema.parse({ repos: ["acme/a"], hiddenRepos: ["acme/a"] });
    expect(config).not.toHaveProperty("hiddenRepos");
  });
});
