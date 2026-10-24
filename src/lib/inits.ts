import { loadConfig } from "./links/config/file";
import { Db } from "./links/db/sqlite";
import { createGithubClient, getToken, type GithubClient } from "./links/github/api";
import { startScheduler, Syncer } from "./mills/sync";
import { closedDays } from "./pacts/schema";

export interface App {
  db: Db;
  gh: GithubClient;
  syncer: Syncer;
  stop(): void;
}

const registry = globalThis as { landschaftApp?: App };

/** One DB handle, GitHub client and sync scheduler per process, surviving Vite HMR re-evaluation. */
export function getApp(): App {
  if (!registry.landschaftApp) {
    const db = new Db();
    const gh = createGithubClient(getToken);
    const syncer = new Syncer({ db, gh, closedDays: () => closedDays(loadConfig()) });
    const stopScheduler = startScheduler(syncer, loadConfig);
    registry.landschaftApp = {
      db,
      gh,
      syncer,
      stop() {
        stopScheduler();
        db.close();
        registry.landschaftApp = undefined;
      },
    };
  }
  return registry.landschaftApp;
}
