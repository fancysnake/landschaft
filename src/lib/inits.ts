import type { ConfigStore } from "./pacts/config";
import type { Services } from "./pacts/services";

import { loadConfig, saveConfig } from "./links/config/file";
import { Db } from "./links/db/sqlite";
import { createGithubClient, getToken } from "./links/forge/github/client";
import { GithubForge } from "./links/forge/github/forge";
import { ConfigKeeper } from "./mills/config";
import { startScheduler, Syncer } from "./mills/sync";
import { Views } from "./mills/views";
import { closedDays } from "./pacts/schema";

export interface App {
  services: Services;
  stop(): void;
}

const registry = globalThis as { landschaftApp?: App };

/** One DB handle, GitHub client and sync scheduler per process, surviving Vite HMR re-evaluation. */
export function getApp(): App {
  if (!registry.landschaftApp) {
    const db = new Db();
    const forge = new GithubForge(createGithubClient(getToken));
    const config: ConfigStore = { load: () => loadConfig(), save: (raw) => saveConfig(raw) };
    const syncer = new Syncer({ db, forge, closedDays: () => closedDays(config.load()) });
    const stopScheduler = startScheduler(syncer, config.load);
    registry.landschaftApp = {
      services: {
        config: new ConfigKeeper(config, syncer),
        sync: syncer,
        views: new Views({
          config: config.load,
          store: db,
          syncer,
          viewer: () => syncer.viewer().catch(() => null),
        }),
      },
      stop() {
        stopScheduler();
        db.close();
        registry.landschaftApp = undefined;
      },
    };
  }
  return registry.landschaftApp;
}
