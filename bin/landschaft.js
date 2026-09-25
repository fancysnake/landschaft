#!/usr/bin/env node
// @ts-check
import { fileURLToPath } from "node:url";

// The package root is one level up from bin/. Astro is pointed here as its `root`, so it
// loads the bundled astro.config.mjs and src/, while landschaft.config.json and
// landschaft.db are read from the directory the command runs in. The production build also
// stays inside the package: the server bundle imports its dependencies relative to itself.
const pkgRootUrl = new URL("..", import.meta.url);
const pkgRoot = fileURLToPath(pkgRootUrl);

const USAGE = `landschaft — kanban dashboards over GitHub issues

Usage:
  landschaft [command]

Commands:
  dev        Start the dev server at http://localhost:4321 (default)
  build      Build the production server
  start      Serve the production build
  -h, --help Show this help

Config is ./landschaft.config.json and the cache ./landschaft.db, unless
LANDSCHAFT_CONFIG / LANDSCHAFT_DB say otherwise.
`;

const command = process.argv[2] ?? "dev";

switch (command) {
  case "dev": {
    const astro = await import("astro");
    await astro.dev({ root: pkgRoot });
    break;
  }
  case "build": {
    const astro = await import("astro");
    await astro.build({ root: pkgRoot });
    break;
  }
  case "start":
    // The standalone node adapter entry starts listening on import.
    await import(new URL("dist/server/entry.mjs", pkgRootUrl).href);
    break;
  case "-h":
  case "--help":
    process.stdout.write(USAGE);
    break;
  default:
    process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
    process.exit(1);
}
