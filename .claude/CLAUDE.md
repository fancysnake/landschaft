# CLAUDE.md

Local-only kanban dashboards over GitHub issues. Astro 7 SSR (`@astrojs/node`, standalone) with
React 19 islands, Tailwind 4, `node:sqlite` cache, JSON config file.

## Tooling and commands

**mise** for tool versions and tasks, **aube** as package manager (`aube-lock.yaml`), never
npm/npx. `node_modules/.bin` is on PATH through mise, so run tools as `mise exec -- <tool>` or
through tasks.

```sh
mise run dev        # dev server at http://localhost:4321
mise run build      # SSR build into dist/
mise run preview    # node dist/server/entry.mjs
mise run check      # astro check (types for .astro and .tsx)
mise run lint       # hk check --all (oxlint, oxfmt --check, file hygiene)
mise run format     # oxfmt --write .
mise run test       # vitest run
mise run fullcheck  # THE GATE before a commit: format check + oxlint + check + test
mise run sync       # POST /api/sync on the running dev server
mise run site:serve # MkDocs (Material) docs at http://localhost:8000
mise run site:check # strict docs build into site/
```

Narrow first: `mise exec -- vitest run src/lib/server/board.test.ts`, `mise exec -- oxlint <file>`.
`hk` installs the pre-commit hook (fix mode) on `mise install`.

Lint rules are configured in `.oxlintrc.json`; never add inline ignores. `.astro` files are only
type-checked (`astro check`), not formatted.

## Layout

- `bin/landschaft.js` — CLI for consumers (`dev|build|start`): runs Astro with `root` = this
  package; config, DB and the production build (`dist/`, fully bundled via `ssr.noExternal`)
  live in the consumer's cwd. Plain JS, `@ts-check`.
- `src/lib/schema.ts` — zod schemas + types shared by server and client (config, filters, move).
- `src/lib/types.ts` — runtime data shapes (Issue, Card, Board, SyncStatus).
- `src/lib/server/` — Node only: `config.ts` (JSON file, atomic save), `db.ts` (SQLite),
  `github.ts` (GraphQL sync queries, REST label writes), `sync.ts` (Syncer + scheduler),
  `board.ts` (**pure** board builder + `labelDiffForMove`), `move.ts`, `app.ts` (process
  singleton booted by `src/middleware.ts`), `api.ts` (endpoint helpers).
- `src/pages/api/**` — JSON endpoints, all wrapped in `route()` from `api.ts`.
- `src/lib/client/` — fetch wrappers, `useBoard` (polling + optimistic move), URL filters, DnD.
- `src/components/board/` and `src/components/settings/` — React islands mounted with
  `client:only="react"` from `src/pages/d/[id].astro` and `src/pages/settings.astro`.

- `docs/` + `mkdocs.yml` — MkDocs Material site (green theme in `docs/assets/extra.css`);
  shared prose is included from README.md through `--8<--` snippet markers.

## Conventions

- Board logic stays pure and unit-tested in `board.ts`; endpoints only glue.
- Sync is sequential on purpose (rate limits); `no-await-in-loop` is off for that reason.
- GitHub writes go through REST by label name; never PATCH the full label list.
- Config edits go through `saveConfig()` (validation + tmp-file rename). Ids are immutable
  once saved because they are in URLs.
- Tests live next to the code as `*.test.ts`; fixtures in `src/lib/server/__fixtures__/`.
- No tests for React forms/components; verify UI in a browser.
