import { parseIssueKey } from "../types";
import { loadConfig, pruneActiveEpics } from "./config";
import { Db } from "./db";
import { createGithubClient, getToken, type GithubClient } from "./github";
import { startScheduler, Syncer } from "./sync";

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
    const syncer = new Syncer({ db, gh });
    const isClosed = (key: string) => {
      const ref = parseIssueKey(key);
      return ref !== null && db.getIssue(ref.repo, ref.number)?.state === "CLOSED";
    };
    const stopScheduler = startScheduler(syncer, () => pruneActiveEpics(loadConfig(), isClosed));
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
