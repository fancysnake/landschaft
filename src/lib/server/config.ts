import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { type Config, ConfigSchema, type Dashboard } from "../schema";

export function configPath(): string {
  return resolve(process.env.LANDSCHAFT_CONFIG ?? "landschaft.config.json");
}

export function loadConfig(file = configPath()): Config {
  if (!existsSync(file)) return { dashboards: [] };
  return ConfigSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

/** Validates, then writes through a temp file so a crash never leaves a half-written config. */
export function saveConfig(config: unknown, file = configPath()): Config {
  const parsed = ConfigSchema.parse(config);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(parsed, null, 2)}\n`);
  renameSync(tmp, file);
  return parsed;
}

export function findDashboard(config: Config, id: string): Dashboard | undefined {
  return config.dashboards.find((dashboard) => dashboard.id === id);
}

export function allRepos(config: Config): string[] {
  return [...new Set(config.dashboards.flatMap((dashboard) => dashboard.repos))];
}

/** Smallest refresh interval any dashboard asks for, per repo. */
export function refreshMinutesByRepo(config: Config): Map<string, number> {
  const minutes = new Map<string, number>();
  for (const dashboard of config.dashboards) {
    for (const repo of dashboard.repos) {
      const current = minutes.get(repo);
      if (current === undefined || dashboard.refreshMinutes < current) {
        minutes.set(repo, dashboard.refreshMinutes);
      }
    }
  }
  return minutes;
}
