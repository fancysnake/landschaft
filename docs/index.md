---
description: "Landschaft is a local, structured inbox for GitHub work: issues, PRs and failed CI jobs from all your repositories, sorted by your own filters."
---

# landschaft

--8<-- "README.md:what"

--8<-- "README.md:dashboards"

--8<-- "README.md:built-with"

## Two ways to run it

1. **Use it as a package** — your dashboards are one JSON file in a (private) repo of their
   own; the engine is an installed dependency you update by bumping a tag. This is the path
   most people want.
2. **Develop from source** — clone the repo and change the views, the sync or the settings UI
   directly. It is simply the repo as you see it.

[Getting started](getting-started.md) covers both.

## Install

Add the engine to the `package.json` of a repo of your own:

--8<-- "README.md:package-json"

## Where to go next

- [Getting started](getting-started.md) — install, run, pin the engine
- [Configuration](configuration.md) — every field of `landschaft.config.json`
- [A working setup](workflow.md) — three real dashboards and how they get used
- [Reference](reference.md) — inboxes, filters, sync, sub-issues
- [CLI](cli.md) — the commands that run and build it
- [API](api.md) — the local JSON endpoints the islands talk to
- [How it works](architecture.md) — the shape of the codebase
- [Changelog](changelog.md) — what each release changed
- [Source on GitHub](https://github.com/fancysnake/landschaft)

## Licensing

MIT. Your dashboards, cache and GitHub token stay on your machine; the engine talks only to
the GitHub API.
