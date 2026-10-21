import type { NavData } from "../types";

import { getApp } from "./app";
import { scopedRepos } from "./board";
import { loadConfig } from "./config";

export async function navData(): Promise<NavData> {
  const { dashboards, repos, users } = loadConfig();
  const { db, syncer } = getApp();
  const viewer = await syncer.viewer().catch(() => null);
  const issues = db.listIssues(repos);
  const jobs = db.listCiJobs(repos);
  return {
    dashboards: dashboards.map(({ id, name, filter }) => ({
      id,
      name,
      repos: [...scopedRepos(issues, jobs, { filter }, users, viewer)],
    })),
    repos,
  };
}
