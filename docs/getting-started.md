# Getting started

## What you need

- [mise](https://mise.jdx.dev), or Node 26+ and a package manager of your choice
- `gh` logged in (`gh auth login`), or a `GITHUB_TOKEN` with `repo` scope in the environment

## Use as a package

A dashboards repo is a `package.json`, a `landschaft.config.json` and a git-ignored
`landschaft.db` — nothing else:

--8<-- "README.md:package-json"

```toml
# mise.toml
[tools]
aube = "2.2.14"
node = "26.10.0"

[hooks]
enter = "aube install"

[env]
_.path = ['{{config_root}}/node_modules/.bin']

[tasks.dev]
run = "aube run dev"
```

```gitignore
node_modules/
dist/
landschaft.db
landschaft.db-*
```

```sh
mise install
mise run dev      # http://localhost:4321
```

Open **Settings**, create a dashboard, add repositories and define swimlanes and columns.
Saving writes `landschaft.config.json` next to `package.json` and triggers the first sync; once
labels are cached the pickers suggest them. Commit the config; the cache is disposable.

The CLI:

--8<-- "README.md:cli"

Config, cache and the production build are read from and written to the directory you run in. `LANDSCHAFT_CONFIG` and
`LANDSCHAFT_DB` override the paths.

## Pin the version, and force the upgrade

There is no registry release behind `github:` — the package manager resolves the ref once,
writes the commit into the lockfile, and reuses that commit forever. So pin the tag you want
and treat it as the version, as the `dependencies` entry above does.

To move to a new release, bump the tag and re-install, then commit the lockfile:

```sh
aube add landschaft@github:fancysnake/landschaft#vX.Y.Z   # or: npm install landschaft@github:...
```

Released versions are the [tags](https://github.com/fancysnake/landschaft/tags).

## Develop from source

```sh
git clone https://github.com/fancysnake/landschaft.git
cd landschaft
mise install   # node, aube, hk, pkl; `aube install` runs on enter
mise run dev   # http://localhost:4321
```

The repo has no config of its own: copy `landschaft.config.example.json` to
`landschaft.config.json` (git-ignored) or create a dashboard in Settings. `mise tasks` lists
everything; `mise run fullcheck` is the gate before a commit.
