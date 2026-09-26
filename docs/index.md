# landschaft

--8<-- "README.md:what"

--8<-- "README.md:grid"

--8<-- "README.md:built-with"

## Two ways to run it

1. **Use it as a package** — your dashboards are one JSON file in a (private) repo of their
   own; the engine is an installed dependency you update by bumping a tag. This is the path
   most people want.
2. **Develop from source** — clone the repo and change the board, the sync or the settings UI
   directly. It is simply the repo as you see it.

[Getting started](getting-started.md) covers both.

## Where to go next

- [Getting started](getting-started.md) — install, run, pin the engine
- [Configuration](configuration.md) — every field of `landschaft.config.json`
- [How the board works](board.md) — placement, dragging, epics, filters
- [API](api.md) — the local JSON endpoints the islands talk to
- [How it works](architecture.md) — the shape of the codebase
- [Source on GitHub](https://github.com/fancysnake/landschaft)

## Licensing

MIT. Your dashboards, cache and GitHub token stay on your machine; the engine talks only to
the GitHub API.
