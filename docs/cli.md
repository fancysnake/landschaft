---
description: "The landschaft command line: dev starts the local server, build makes the production server in dist, start serves it, and what each one reads and writes."
---

# CLI

`landschaft` reads its config and cache from the directory it runs in, and writes the production
build there too. `LANDSCHAFT_CONFIG` and `LANDSCHAFT_DB` override the two paths; see
[Files and environment](configuration.md#files-and-environment).

--8<-- "README.md:cli"

`build` bundles every dependency in, so `dist/` runs from anywhere, with no `node_modules` beside
it.

Without a build, `start` says so and exits with status 1; run `landschaft build` first.

`landschaft --help` prints the usage; `-h` does the same. An unknown command prints it too, and
exits with status 1.
