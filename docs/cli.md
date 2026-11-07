---
description: "The landschaft command line: dev starts the local server, build makes the production server in dist, start serves it, and what each one reads and writes."
---

# CLI

`landschaft` reads its config and cache from the directory it runs in, and writes the production
build there too. `LANDSCHAFT_CONFIG` and `LANDSCHAFT_DB` override the two paths; see
[Files and environment](configuration.md#files-and-environment).

## landschaft dev

Starts the dev server at http://localhost:4321. It is the default command, so a bare `landschaft`
does the same.

## landschaft build

Builds the production server into `./dist`. Every dependency is bundled in, so `dist/` runs from
anywhere, with no `node_modules` beside it.

## landschaft start

Serves the production build from `./dist`. Without a build it says so and exits with status 1;
run `landschaft build` first.

## landschaft --help

Prints the usage; `-h` does the same. An unknown command prints it too, and exits with status 1.
