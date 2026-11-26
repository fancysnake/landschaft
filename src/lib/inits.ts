import { resolve } from "node:path";

import type { ConfigStore } from "./pacts/config";
import type { Forge } from "./pacts/forge";
import type { Services } from "./pacts/services";

import { startTimer } from "./gates/timer/node";
import { loadConfig, saveConfig } from "./links/config/file";
import { Db } from "./links/db/sqlite";
import { createGithubClient, getToken } from "./links/forge/github/client";
import { GithubForge } from "./links/forge/github/forge";
import { createGitlabClient, getAccess } from "./links/forge/gitlab/client";
import { GitlabForge } from "./links/forge/gitlab/forge";
import { ConfigKeeper } from "./mills/config";
import { Syncer } from "./mills/sync";
import { Views } from "./mills/views";

export interface App {
  services: Services;
  stop(): void;
}

/** The forge `pick` names at each call, so a saved backend applies to the next sync. */
function switching(pick: () => Forge): Forge {
  return {
    issuesPage: (...args) => pick().issuesPage(...args),
    pullsPage: (...args) => pick().pullsPage(...args),
    pullStatuses: (...args) => pick().pullStatuses(...args),
    ciBranchesPage: (...args) => pick().ciBranchesPage(...args),
    ciJobs: (...args) => pick().ciJobs(...args),
    viewer: () => pick().viewer(),
    repoLabels: (...args) => pick().repoLabels(...args),
  };
}

const registry = globalThis as { landschaftApp?: App };

/** One DB handle, forge and sync scheduler per process, surviving Vite HMR re-evaluation. */
export function getApp(): App {
  if (!registry.landschaftApp) {
    const configFile = resolve(process.env.LANDSCHAFT_CONFIG ?? "landschaft.config.json");
    const db = new Db(process.env.LANDSCHAFT_DB ?? "landschaft.db");
    const config: ConfigStore = {
      load: () => loadConfig(configFile),
      save: (raw) => saveConfig(raw, configFile),
    };
    const forges = {
      github: new GithubForge(createGithubClient(getToken)),
      gitlab: new GitlabForge(createGitlabClient(getAccess)),
    };
    const forge = switching(() => forges[config.load().backend]);
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
