#!/usr/bin/env node
// @ts-check
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The package root is one level up from bin/. Astro is pointed here as its `root`, so it
// loads the bundled astro.config.mjs and src/, while landschaft.config.json, landschaft.db
// and the production build (dist/) live in the directory the command runs in.
const pkgRoot = fileURLToPath(new URL("..", import.meta.url));
const outDir = path.resolve("dist");

const USAGE = `landschaft — kanban dashboards over GitHub issues

Usage:
  landschaft [command]

Commands:
  dev        Start the dev server at http://localhost:4321 (default)
  build      Build the production server into ./dist
  start      Serve the production build from ./dist
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
    // Bundle every dependency into the server build so dist/ runs from anywhere: it lands in
    // the consumer directory, away from any node_modules.
    await astro.build({ root: pkgRoot, outDir, vite: { ssr: { noExternal: true } } });
    break;
  }
  case "start": {
    const entry = path.join(outDir, "server", "entry.mjs");
    if (!existsSync(entry)) {
      process.stderr.write(`No production build at ${outDir}. Run \`landschaft build\` first.\n`);
      process.exit(1);
    }
    // The standalone node adapter entry starts listening on import.
    await import(pathToFileURL(entry).href);
    break;
  }
  case "-h":
  case "--help":
    process.stdout.write(USAGE);
    break;
  default:
    process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
    process.exit(1);
}
