# landschaft

<!-- --8<-- [start:tagline] -->

Local kanban dashboards over GitHub issues. _Landschaft_ is German for "landscape": the point
is to see the whole terrain of a project at once, spot what is next and how far each epic has
come, without paying for GitHub Projects.

A dashboard spans one or more repositories and lays their open issues out on a grid of
swimlanes × columns, both defined by labels. Dragging a card swaps the labels on GitHub.
Everything runs on your machine against a local SQLite cache that refreshes in the background.

<!-- --8<-- [end:tagline] -->

- **Docs:** <https://landschaft.fancysnake.dev>

<!-- --8<-- [start:built-with] -->

Built with [Astro](https://astro.build) (SSR, node adapter), [React](https://react.dev) islands,
[Tailwind](https://tailwindcss.com) and Node's built-in SQLite. Tooling:
[mise](https://mise.jdx.dev) for tasks and tool versions, [aube](https://aube.jdx.dev) as the
package manager.

<!-- --8<-- [end:built-with] -->

## Use as a package

The engine installs straight from GitHub; your dashboards live in a separate (private) repo
holding a `package.json`, a `landschaft.config.json` and a git-ignored `landschaft.db`:

```json
{
  "name": "my-dashboards",
  "private": true,
  "type": "module",
  "scripts": { "dev": "landschaft dev", "build": "landschaft build", "start": "landschaft start" },
  "dependencies": { "landschaft": "github:fancysnake/landschaft#v0.1.1" }
}
```

```sh
aube install          # or npm install
aube run dev          # http://localhost:4321, reads ./landschaft.config.json
```

| Command            | What it does                                          |
| ------------------ | ----------------------------------------------------- |
| `landschaft dev`   | Dev server at http://localhost:4321 (default command) |
| `landschaft build` | Build the production server into `./dist`             |
| `landschaft start` | Serve the production build from `./dist`              |

Pin the tag and treat it as the version: `github:` refs are resolved once and frozen in the
lockfile, so a bare ref silently stays on whatever `main` was on install day. To upgrade, bump
the tag and re-install (`aube add landschaft@github:fancysnake/landschaft#vX.Y.Z`), then commit
the lockfile. Releases are the [tags](https://github.com/fancysnake/landschaft/tags).

## Run from source

Requirements:

- [mise](https://mise.jdx.dev) (installs node, aube, hk and pkl from `mise.toml`)
- `gh` logged in (`gh auth login`), or a `GITHUB_TOKEN` with `repo` scope

```sh
mise install
mise run dev        # http://localhost:4321
```

For a production build: `mise run build` then `mise run preview`.

Open **Settings**, create a dashboard, add repositories and define swimlanes and columns.
Saving triggers the first sync; once labels are cached the pickers suggest them.

## How placement works

<!-- --8<-- [start:placement] -->

- A dashboard shows only open issues **you created or are assigned to** (scope `mine`, the
  default; "you" is the account behind the token). Switch a dashboard to `all` in settings to
  see everyone's.
- Each swimlane and column lists the labels it matches. An issue lands in the **first** entry
  (in order) it satisfies: by default carrying **any** of the labels; an entry set to **all**
  needs every one of them (`"match": "all"` in the config).
- An entry with **no labels is the catch-all** for issues matching nothing else. At most one per
  axis. Issues that fit neither are counted as "unplaced" on the board.
- Dragging an issue removes the source entry's labels it carries and adds what the target
  entry needs: its first label, or every label for an "all" entry. Dropping on a catch-all
  only removes.
- **Hide blocked** (per swimlane) drops issues that have at least one open blocker
  (GitHub "blocked by" relationships).
- Issues carrying the **epic label** appear in the strip above the board with sub-issue
  progress; clicking one filters the board to its children.
- Filters (text, assignee, label, epic, sort) live in the URL, so a view is a link.

<!-- --8<-- [end:placement] -->

## Data

| What        | Where                                                      |
| ----------- | ---------------------------------------------------------- |
| Dashboards  | `./landschaft.config.json` (`LANDSCHAFT_CONFIG` overrides) |
| Issue cache | `./landschaft.db` (`LANDSCHAFT_DB` overrides), git-ignored |

Both are relative to the directory you run in. In this repo `landschaft.config.json` is
git-ignored (see `landschaft.config.example.json`).

Sync is incremental (issues updated since the last run); a full pass of every open issue runs
once a day, on demand from the board, and for newly added repositories. Rate-limit budget is
shown next to the sync status.

## API

All JSON, no auth (local only):

| Route                           | Purpose                                               |
| ------------------------------- | ----------------------------------------------------- |
| `GET/PUT /api/config`           | Read or replace the whole config (validated)          |
| `GET /api/dashboards/:id/board` | Computed board; query string = filters                |
| `POST /api/sync`                | `{ "repo"?: "o/r", "full"?: true }`                   |
| `GET /api/version`              | Sync status; the board polls this                     |
| `GET /api/labels?repos=a/b,c/d` | Cached label catalogue                                |
| `POST /api/move`                | Apply a drag: label diff on GitHub, refetch the issue |

## Development

Everything else is in the [docs](https://landschaft.fancysnake.dev) (MkDocs sources in
[`docs/`](docs); `mise run site:serve` to preview them).

`mise tasks` lists everything. `mise run fullcheck` is the gate before a commit (format check,
oxlint, `astro check`, vitest). `hk` installs a pre-commit hook that formats and lints staged
files.
