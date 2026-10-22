import type { NavData } from "../types";

import { viewData } from "./api";
import { scopedRepos } from "./board";
import { loadConfig } from "./config";

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
