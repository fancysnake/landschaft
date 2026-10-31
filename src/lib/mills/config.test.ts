import { describe, expect, it, vi } from "vitest";

import { type Config, ConfigSchema } from "../pacts/schema";
import { InvalidError } from "../pacts/services";
import { ConfigKeeper } from "./config";

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

  it("syncs nothing when no repo needs it", () => {
    const { keeper, syncer } = setup(["acme/a"]);
    keeper.save(keeper.load());
    expect(syncer.syncAll).not.toHaveBeenCalled();
  });
});

describe("ConfigKeeper.setHidden", () => {
  it("switches repos off and back on", () => {
    const { keeper } = setup(["acme/a", "acme/b", "acme/c"]);
    expect(keeper.setHidden(["acme/a", "acme/b"], true).hiddenRepos).toEqual(["acme/a", "acme/b"]);
    expect(keeper.setHidden(["acme/b"], true).hiddenRepos).toEqual(["acme/a", "acme/b"]);
    expect(keeper.setHidden(["acme/a"], false).hiddenRepos).toEqual(["acme/b"]);
  });

  it("rejects a repo outside the config", () => {
    const { keeper } = setup(["acme/a"]);
    expect(() => keeper.setHidden(["acme/x"], true)).toThrow(InvalidError);
  });

  it("is not undone by a save carrying an older set", () => {
    const { keeper } = setup(["acme/a", "acme/b"]);
    const stale = keeper.load();
    keeper.setHidden(["acme/a"], true);
    expect(keeper.save({ ...stale, hiddenRepos: ["acme/b"] }).hiddenRepos).toEqual(["acme/a"]);
  });
});
