import { describe, expect, it, vi } from "vitest";

import { type Config, ConfigSchema } from "../pacts/config";
import { ConfigKeeper, reposToResync } from "./config";

function setup(repos: string[]) {
  let stored = ConfigSchema.parse({ repos });
  const store = {
    load: () => stored,
    save: (raw: unknown) => (stored = ConfigSchema.parse(raw)),
  };
  const syncer = { syncAll: vi.fn(async () => {}) };
  return { keeper: new ConfigKeeper(store, syncer), syncer };
}

describe("ConfigKeeper.save", () => {
  it("fully resyncs the repos a save adds", () => {
    const { keeper, syncer } = setup(["acme/a"]);
    const saved: Config = keeper.save({ ...keeper.load(), repos: ["acme/a", "acme/b"] });
    expect(saved.repos).toEqual(["acme/a", "acme/b"]);
    expect(syncer.syncAll).toHaveBeenCalledWith(["acme/b"], { full: true });
  });

  it("fully resyncs every repo when a save changes the backend", () => {
    const { keeper, syncer } = setup(["acme/a", "acme/b"]);
    keeper.save({ ...keeper.load(), backend: "gitlab" });
    expect(syncer.syncAll).toHaveBeenCalledWith(["acme/a", "acme/b"], { full: true });
  });

  it("syncs nothing when no repo needs it", () => {
    const { keeper, syncer } = setup(["acme/a"]);
    keeper.save(keeper.load());
    expect(syncer.syncAll).not.toHaveBeenCalled();
  });
});

const github = (...repos: string[]) => ({ backend: "github" as const, repos });

describe("reposToResync", () => {
  it("resyncs only the added repos", () => {
    expect(reposToResync(github("acme/a"), github("acme/a", "acme/b"))).toEqual(["acme/b"]);
    expect(reposToResync(github("acme/a"), github("acme/a"))).toEqual([]);
  });

  it("resyncs every repo under a new backend", () => {
    expect(reposToResync(github("acme/a"), { backend: "gitlab", repos: ["acme/a"] })).toEqual([
      "acme/a",
    ]);
  });
});
