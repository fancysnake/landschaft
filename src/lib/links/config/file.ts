import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { type Config, ConfigSchema } from "../../pacts/config";

export function loadConfig(file: string): Config {
  if (!existsSync(file)) return ConfigSchema.parse({});
  return ConfigSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

/** Validates, then writes through a temp file so a crash never leaves a half-written config. */
export function saveConfig(config: unknown, file: string): Config {
  const parsed = ConfigSchema.parse(config);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(parsed, null, 2)}\n`);
  renameSync(tmp, file);
  return parsed;
}
