import type { Config } from "./schema";

/** Where the config is kept; `save` validates before it writes. */
export interface ConfigStore {
  load(): Config;
  save(config: unknown): Config;
}
