import { describe, expect, it } from "vitest";

import { filtersToQuery } from "./client/api";
import { readFilters } from "./client/useUrlFilters";
import { FiltersSchema, hiddenRepos, repoFilter, selectedRepos, shownRepos } from "./schema";

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

describe("hidden repos", () => {
  const board = ["acme/a", "acme/b"];

  it("hides what a board turned off and keeps what other boards hid", () => {
    expect(hiddenRepos(["acme/a"], board, ["acme/b", "acme/x"])).toEqual(["acme/x", "acme/b"]);
    expect(hiddenRepos(board, board, ["acme/a", "acme/x"])).toEqual(["acme/x"]);
  });

  it("shows all but the hidden, unless the URL picks repos", () => {
    expect(shownRepos({ hide: ["acme/b", "acme/x"] }, board)).toEqual(["acme/a"]);
    expect(shownRepos({ hide: ["acme/b"], repo: ["acme/b"] }, board)).toEqual(["acme/b"]);
    expect(shownRepos({ hide: board }, board)).toEqual([]);
    expect(shownRepos({}, board)).toEqual(board);
  });
});
