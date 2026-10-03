import { describe, expect, it } from "vitest";

import { filtersToQuery } from "./client/api";
import { readFilters } from "./client/useUrlFilters";
import { FiltersSchema, repoFilter, selectedRepos } from "./schema";

describe("repo filter", () => {
  const repos = ["acme/a", "acme/b", "acme/c"];

  it("parses the query value into a list, absent meaning unset and empty meaning none", () => {
    expect(FiltersSchema.parse({ repo: "acme/a,acme/b" }).repo).toEqual(["acme/a", "acme/b"]);
    expect(FiltersSchema.parse({}).repo).toBeUndefined();
    expect(FiltersSchema.parse({ repo: "" }).repo).toEqual([]);
  });

  it("encodes an empty selection as repo= and reads it back", () => {
    expect(filtersToQuery({ repo: [] })).toBe("repo=");
    expect(readFilters(`?${filtersToQuery({ repo: [] })}`).repo).toEqual([]);
    expect(filtersToQuery({ repo: undefined })).toBe("");
  });

  it("round-trips through selectedRepos and repoFilter", () => {
    expect(repoFilter(selectedRepos(["acme/b"], repos), repos)).toEqual(["acme/b"]);
    expect(repoFilter(selectedRepos(undefined, repos), repos)).toBeUndefined();
    expect(repoFilter(selectedRepos([], repos), repos)).toEqual([]);
  });

  it("falls back to every repo for a stale list or a single-repo dashboard", () => {
    expect(selectedRepos(["acme/gone"], repos)).toEqual(repos);
    expect(selectedRepos([], ["acme/a"])).toEqual(["acme/a"]);
  });
});
