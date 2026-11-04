import { resolve } from "node:path";

import type { ConfigStore } from "./pacts/config";
import type { Services } from "./pacts/services";

import { startTimer } from "./gates/timer/node";
import { loadConfig, saveConfig } from "./links/config/file";
import { Db } from "./links/db/sqlite";
import { createGithubClient, getToken } from "./links/forge/github/client";
import { GithubForge } from "./links/forge/github/forge";
import { ConfigKeeper } from "./mills/config";
import { Syncer } from "./mills/sync";
import { Views } from "./mills/views";

export interface App {
  services: Services;
  stop(): void;
}

const registry = globalThis as { landschaftApp?: App };

/** One DB handle, GitHub client and sync scheduler per process, surviving Vite HMR re-evaluation. */
export function getApp(): App {
  if (!registry.landschaftApp) {
    const configFile = resolve(process.env.LANDSCHAFT_CONFIG ?? "landschaft.config.json");
    const db = new Db(process.env.LANDSCHAFT_DB ?? "landschaft.db");
    const forge = new GithubForge(createGithubClient(getToken));
    const config: ConfigStore = {
      load: () => loadConfig(configFile),
      save: (raw) => saveConfig(raw, configFile),
    };
    const syncer = new Syncer({ db, forge, config: config.load });
    const stopTimer = startTimer(syncer);
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
        stopTimer();
        db.close();
        registry.landschaftApp = undefined;
      },
    };
  }
  return registry.landschaftApp;
}
