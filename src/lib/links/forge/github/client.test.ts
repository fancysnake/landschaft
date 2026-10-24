import { describe, expect, it, vi } from "vitest";

import { createGithubClient } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createGithubClient", () => {
  it("sends the token with a timeout and surfaces GraphQL errors", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ errors: [{ message: "bad" }, { message: "worse" }] }),
    );
    const gh = createGithubClient(async () => "tok", fetchImpl);
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await expect(gh.gql("query {}", {})).rejects.toThrow("bad; worse");
    expect(timeout).toHaveBeenCalledWith(30_000);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/graphql");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(init.signal).toBe(timeout.mock.results[0]?.value);
    timeout.mockRestore();
  });

  it("keeps the data next to errors only when it accepts all of them", async () => {
    const errors = [
      { message: "Could not resolve head ref", type: "NOT_FOUND" },
      { message: "Something went wrong", type: "INTERNAL" },
    ];
    const gh = createGithubClient(
      async () => "tok",
      async () => jsonResponse({ data: { ok: true }, errors }),
    );
    await expect(gh.gql("q", {})).rejects.toThrow("Could not resolve head ref");
    await expect(gh.gql("q", {}, { acceptError: () => true })).resolves.toEqual({ ok: true });
    await expect(
      gh.gql("q", {}, { acceptError: (error) => error.type === "NOT_FOUND" }),
    ).rejects.toThrow("Something went wrong");
  });

  it("resolves the token once", async () => {
    const tokenSource = vi.fn(async () => "tok");
    const gh = createGithubClient(tokenSource, async () => jsonResponse({ data: { ok: true } }));
    await gh.gql("q", {});
    await gh.gql("q", {});
    expect(tokenSource).toHaveBeenCalledTimes(1);
  });
});
