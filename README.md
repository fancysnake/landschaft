# landschaft

<!-- --8<-- [start:what] -->

Local kanban dashboards over GitHub issues. _Landschaft_ is German for "landscape": the point
is to see the whole terrain of a project at once, spot what is next and how far each epic has
come, without paying for GitHub Projects.

<!-- --8<-- [end:what] -->

<!-- --8<-- [start:grid] -->

A dashboard spans one or more repositories and lays their open issues out on a grid of
swimlanes × columns, both defined by labels. Dragging a card swaps the labels on GitHub.
Everything runs on your machine against a local SQLite cache that refreshes in the background.

<!-- --8<-- [end:grid] -->

Documentation is at [landschaft.fancysnake.dev](https://landschaft.fancysnake.dev).

<!-- --8<-- [start:built-with] -->

Built with [Astro](https://astro.build) (SSR, node adapter), [React](https://react.dev) islands,
[Tailwind](https://tailwindcss.com) and Node's built-in SQLite. Tooling:
[mise](https://mise.jdx.dev) for tasks and tool versions, [aube](https://aube.jdx.dev) as the
package manager.

<!-- --8<-- [end:built-with] -->

## Use as a package

The engine installs straight from GitHub; your dashboards live in a separate (private) repo
holding a `package.json`, a `landschaft.config.json` and a git-ignored `landschaft.db`:

<!-- --8<-- [start:package-json] -->

```json
{
  "name": "my-dashboards",
  "private": true,
  "type": "module",
  "scripts": { "dev": "landschaft dev", "build": "landschaft build", "start": "landschaft start" },
  "dependencies": { "landschaft": "github:fancysnake/landschaft#v0.4.0" }
}
```

<!-- --8<-- [end:package-json] -->

```sh
aube install          # or npm install
aube run dev          # http://localhost:4321, reads ./landschaft.config.json
```

<!-- --8<-- [start:cli] -->

| Command            | What it does                                          |
| ------------------ | ----------------------------------------------------- |
| `landschaft dev`   | Dev server at http://localhost:4321 (default command) |
| `landschaft build` | Build the production server into `./dist`             |
| `landschaft start` | Serve the production build from `./dist`              |

<!-- --8<-- [end:cli] -->

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

- A dashboard shows only open issues **its users created or are assigned to**. The default is
  `@me`, the account behind the token; list other GitHub logins in settings to follow them too,
  or remove every user to see everyone's.
- Each swimlane and column lists the labels it matches. An issue lands in the **first**
  swimlane and the **last** column (in order) it satisfies, so a card carrying two stages'
  labels sits in the later one: by default carrying **any** of the labels; an entry set to
  **all** needs every one of them (`"match": "all"` in the config).
- A swimlane or column can take **only issues or only pull requests** (`"kind": "issue"` /
  `"pr"`, default `"any"`; an `is:issue` / `is:pr` chip in the settings editor), on top of its
  labels whatever the match; with no labels it takes every item of that kind.
- Four **PR status labels** match like labels but come from GitHub, not from the PR's labels:
  `is:conflicting` (merge conflicts), `is:ci:failed` (a required (or `codecov/*`) check failed),
  `is:ci:running` (a required (or `codecov/*`) check has not finished; any check when the base
  branch requires none) and `is:unanswered` (an
  unresolved review thread whose last comment is not the PR author's). One "any of" swimlane with
  `is:conflicting`, `is:ci:failed` and `is:unanswered` gathers the PRs waiting on their author. A
  move never adds or removes them. The config rejects any other `is:` label.
- An entry with **no labels (and any kind) is the catch-all** for issues matching nothing else.
  At most one per axis. Issues that fit neither are counted as "unplaced" on the board.
- Dragging an issue removes the source entry's labels it carries and adds what the target
  entry needs: its first label, or every label for an "all" entry. Dropping on a catch-all
  only removes.
- **Hide blocked** (per swimlane) drops issues that have at least one open blocker
  (GitHub "blocked by" relationships).
- Issues carrying the **epic label** appear in the strip above the board with sub-issue
  progress; clicking one filters the board to its sub-issues and to issues it blocks or is
  blocked by; ↗ opens it on GitHub. Pull requests linked to any of those issues (or to the
  epic) show up too.
- Open **pull requests** are cards like issues. On multi-repo boards, chips above the board
  switch each repository on or off.
- Filters (text, repos, assignee, label, epic, sort) live in the URL, so a view is a link.

<!-- --8<-- [end:placement] -->

## Data and API

Dashboards live in `./landschaft.config.json` and the issue cache in `./landschaft.db`; see
[Files and environment](https://landschaft.fancysnake.dev/configuration/#files-and-environment).
The local JSON endpoints are listed under [API](https://landschaft.fancysnake.dev/api/).

## Development

Everything else is in the [docs](https://landschaft.fancysnake.dev) (MkDocs sources in
[`docs/`](docs); `mise run site:dev` to preview them, `mise run site:build` to build them).

`mise tasks` lists everything. `mise run fullcheck` is the gate before a commit and in CI
(`hk` lint, `astro check`, vitest, build). `hk` installs a pre-commit hook that formats and lints staged
files.
