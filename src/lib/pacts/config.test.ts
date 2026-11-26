import { describe, expect, it } from "vitest";

import { ConfigSchema } from "./config";

describe("backend", () => {
  it("is GitHub for a config without one", () => {
    expect(ConfigSchema.parse({ repos: ["acme/a"] }).backend).toBe("github");
  });

  it("takes GitLab with nested project paths, and no backend it does not know", () => {
    const config = ConfigSchema.parse({ backend: "gitlab", repos: ["group/sub/project"] });
    expect(config).toMatchObject({ backend: "gitlab", repos: ["group/sub/project"] });
    expect(ConfigSchema.safeParse({ backend: "gitea" }).success).toBe(false);
    expect(ConfigSchema.safeParse({ repos: ["project"] }).success).toBe(false);
  });
});

describe("hidden repos", () => {
  it("loads a config that still lists them, without the list", () => {
    const config = ConfigSchema.parse({ repos: ["acme/a"], hiddenRepos: ["acme/a"] });
    expect(config).not.toHaveProperty("hiddenRepos");
  });
});
