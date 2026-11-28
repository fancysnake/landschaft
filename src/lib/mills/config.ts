import type { Config, ConfigStore } from "../pacts/config";
import type { ConfigService, SyncService } from "../pacts/services";

type Scope = Pick<Config, "backend" | "repos">;

/**
 * The repos a full sync must fetch once the config goes from `previous` to `next`: the added
 * ones, or all of them under a new backend.
 */
export function reposToResync(previous: Scope, next: Scope): string[] {
  if (previous.backend !== next.backend) return next.repos;
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

  save(config: Config): Config {
    const previous = this.store.load();
    const saved = this.store.save(config);
    const repos = reposToResync(previous, saved);
    if (repos.length > 0) void this.syncer.syncAll(repos, { full: true });
    return saved;
  }
}
