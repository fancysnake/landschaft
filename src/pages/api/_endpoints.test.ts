import type { APIContext, APIRoute } from "astro";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Services } from "../../lib/pacts/services";

import { DASHBOARD, REPO } from "../../lib/__fixtures__/issues";
import { Db } from "../../lib/links/db/sqlite";
import { GithubForge } from "../../lib/links/forge/github/forge";
import { ConfigKeeper } from "../../lib/mills/config";
import { Syncer } from "../../lib/mills/sync";
import { Views } from "../../lib/mills/views";
import { type Config, ConfigSchema } from "../../lib/pacts/config";
import { GET as board } from "./dashboards/[id]/board";
import { POST as starredEpics } from "./dashboards/[id]/starred-epics";
import { POST as hiddenRepos } from "./hidden-repos";
import { POST as sync } from "./sync";

let db: Db;
let services: Services & { sync: Syncer };

beforeEach(() => {
  db = new Db(":memory:");
  let stored = ConfigSchema.parse({ repos: [REPO], dashboards: [DASHBOARD] });
  const store = {
    load: () => stored,
    save: (raw: unknown): Config => (stored = ConfigSchema.parse(raw)),
  };
  const offline = {
    gql: async () => {
      throw new Error("offline");
    },
  };
  const syncer = new Syncer({ db, forge: new GithubForge(offline), config: store.load });
  services = {
    config: new ConfigKeeper(store, syncer),
    sync: syncer,
    views: new Views({ config: store.load, store: db, syncer, viewer: async () => null }),
  };
});

afterEach(async () => {
  await services.sync.syncAll([]);
  db.close();
});

/** Calls `endpoint` the way Astro does for `path`, with `body` as JSON when given. */
async function call(
  endpoint: APIRoute,
  path: string,
  { body, params = {} }: { body?: unknown; params?: Record<string, string> } = {},
) {
  const url = new URL(path, "http://localhost");
  const request = new Request(url, {
    method: body === undefined ? "GET" : "POST",
    body: typeof body === "string" ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const context = { locals: { services }, params, request, url } as unknown as APIContext;
  const response = await endpoint(context);
  return { status: response.status, body: await response.json() };
}

describe("POST /api/sync", () => {
  it("starts a sync-all over every configured repo", async () => {
    const response = await call(sync, "/api/sync", { body: {} });
    expect(response).toMatchObject({ status: 202, body: { run: 1, status: { runs: 0 } } });
    await vi.waitFor(() =>
      expect(services.sync.status()).toMatchObject({ runs: 1, lastError: `${REPO}: offline` }),
    );
  });

  it("answers 400 for a repo outside the config", async () => {
    expect(await call(sync, "/api/sync", { body: { repos: ["acme/other"] } })).toEqual({
      status: 400,
      body: { error: "not configured: acme/other" },
    });
  });

  it("answers 400 for a body that is not JSON", async () => {
    expect(await call(sync, "/api/sync", { body: "{" })).toEqual({
      status: 400,
      body: { error: "invalid JSON body" },
    });
  });
});

describe("GET /api/dashboards/[id]/board", () => {
  it("returns the board", async () => {
    const response = await call(board, "/api/dashboards/main/board", { params: { id: "main" } });
    expect(response).toMatchObject({ status: 200, body: { dashboard: { id: "main" } } });
  });

  it("answers 404 for an unknown dashboard", async () => {
    expect(await call(board, "/api/dashboards/nope/board", { params: { id: "nope" } })).toEqual({
      status: 404,
      body: { error: "board not found" },
    });
  });
});

describe("POST /api/dashboards/[id]/starred-epics", () => {
  it("answers 404 for an unknown dashboard", async () => {
    const response = await call(starredEpics, "/api/dashboards/nope/starred-epics", {
      body: { epic: `${REPO}#1`, starred: true },
      params: { id: "nope" },
    });
    expect(response.status).toBe(404);
  });

  it("answers 400 for an epic outside the configured repos", async () => {
    const response = await call(starredEpics, "/api/dashboards/main/starred-epics", {
      body: { epic: "acme/other#1", starred: true },
      params: { id: "main" },
    });
    expect(response.status).toBe(400);
  });
});

describe("POST /api/hidden-repos", () => {
  it("answers 400 for a repo outside the config", async () => {
    expect(
      await call(hiddenRepos, "/api/hidden-repos", {
        body: { repos: ["acme/other"], hidden: true },
      }),
    ).toEqual({ status: 400, body: { error: "repository is not configured" } });
  });
});
