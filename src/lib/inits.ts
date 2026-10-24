import type { Audience, NavData, Snapshot } from "./pacts/types";

import { loadConfig } from "./links/config/file";
import { Db } from "./links/db/sqlite";
import { createGithubClient, getToken, type GithubClient } from "./links/forge/github/client";
import { scopedRepos } from "./mills/board";
import { startScheduler, Syncer } from "./mills/sync";
import { closedDays, type Config } from "./pacts/schema";

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

/**
 * The cached issues and jobs of the configured repos and who views them; `viewer` is null when it
 * cannot be fetched.
 */
export async function viewData({
  repos,
  users,
}: Pick<Config, "repos" | "users">): Promise<Audience & { snapshot: Snapshot }> {
  const { db, syncer } = getApp();
  return { snapshot: db.snapshot(repos), users, viewer: await syncer.viewer().catch(() => null) };
}

export async function navData(): Promise<NavData> {
  const config = loadConfig();
  const { snapshot, ...audience } = await viewData(config);
  return {
    dashboards: config.dashboards.map(({ id, name, filter }) => ({
      id,
      name,
      repos: [...scopedRepos(snapshot, { filter }, audience)],
    })),
    repos: config.repos,
  };
}
