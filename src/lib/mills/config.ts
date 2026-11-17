import type { ConfigStore } from "../pacts/config";

import { type Config, isRaw } from "../pacts/config";
import { type ConfigService, InvalidError, type SyncService } from "../pacts/services";

type Scope = Pick<Config, "repos">;

/** The repos a full sync must fetch once the config goes from `previous` to `next`: the added ones. */
export function reposToResync(previous: Scope, next: Scope): string[] {
  const before = new Set(previous.repos);
  return next.repos.filter((repo) => !before.has(repo));
}

export class ConfigKeeper implements ConfigService {
  constructor(
    private readonly store: ConfigStore,
    private readonly syncer: Pick<SyncService, "syncAll">,
  ) {}

  load(): Config {
    return this.store.load();
  }

  save(config: unknown): Config {
    const previous = this.store.load();
    // The nav switches repos through `setHidden`; an editor's copy may predate that.
    const kept = isRaw(config) ? { ...config, hiddenRepos: previous.hiddenRepos } : config;
    const saved = this.store.save(kept);
    const repos = reposToResync(previous, saved);
    if (repos.length > 0) void this.syncer.syncAll(repos, { full: true });
    return saved;
  }

  setHidden(repos: string[], hidden: boolean): Config {
    const config = this.store.load();
    if (repos.some((repo) => !config.repos.includes(repo))) {
      throw new InvalidError("repository is not configured");
    }
    const rest = config.hiddenRepos.filter((repo) => !repos.includes(repo));
    return this.store.save({ ...config, hiddenRepos: hidden ? [...rest, ...repos] : rest });
  }
}
