import { describe, expect, it } from "vitest";

import { HIDDEN_REPOS_COOKIE, hiddenRepos, hiddenReposCookie } from "./web";

/** The cookie jar a request carries after a browser stores `setCookie`. */
function jar(setCookie: string) {
  const [pair = ""] = setCookie.split(";");
  const [name = "", value = ""] = pair.split("=");
  return {
    get: (key: string) => (key === name ? { value: decodeURIComponent(value) } : undefined),
  };
}

describe("hidden repos cookie", () => {
  it("reads back what it writes", () => {
    const repos = ["acme/app", "acme/lib"];
    expect(hiddenRepos(jar(hiddenReposCookie(repos)))).toEqual(repos);
  });

  it("reads no repos from a cleared list or a missing cookie", () => {
    expect(hiddenRepos(jar(hiddenReposCookie([])))).toEqual([]);
    expect(hiddenRepos({ get: () => undefined })).toEqual([]);
  });

  it("drops entries that are no repo name", () => {
    const cookies = { get: () => ({ value: `acme/app,<script>,,x y/z,acme/lib` }) };
    expect(hiddenRepos(cookies)).toEqual(["acme/app", "acme/lib"]);
    expect(HIDDEN_REPOS_COOKIE).toBe("landschaft_hidden_repos");
  });
});
