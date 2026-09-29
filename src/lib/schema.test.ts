import { describe, expect, it } from "vitest";

import { FiltersSchema, repoFilter, selectedRepos } from "./schema";

describe("repo filter", () => {
  const repos = ["acme/a", "acme/b", "acme/c"];

  it("parses the query value into a list, empty meaning unset", () => {
    expect(FiltersSchema.parse({ repo: "acme/a,acme/b" }).repo).toEqual(["acme/a", "acme/b"]);
    expect(FiltersSchema.parse({ repo: "" }).repo).toBeUndefined();
  });

  it("round-trips through selectedRepos and repoFilter", () => {
    expect(repoFilter(selectedRepos(["acme/b"], repos), repos)).toEqual(["acme/b"]);
    expect(repoFilter(selectedRepos(undefined, repos), repos)).toBeUndefined();
    expect(repoFilter(selectedRepos(["acme/gone"], repos), repos)).toBeUndefined();
  });
});
