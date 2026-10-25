import type { ConfigService, SyncService } from "../pacts/services";

import { type Config, type ConfigStore, reposToResync } from "../pacts/schema";

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
    const saved = this.store.save(config);
    const repos = reposToResync(previous, saved);
    if (repos.length > 0) void this.syncer.syncAll(repos, { full: true });
    return saved;
  }
}
