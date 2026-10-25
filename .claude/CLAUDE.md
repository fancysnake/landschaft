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
mise run preview    # node bin/landschaft.js start
mise run check      # astro check (types for .astro and .tsx)
mise run lint       # hk check --all (oxlint, oxfmt --check, file hygiene)
mise run format     # oxfmt --write .
mise run test       # vitest run
mise run fullcheck  # THE GATE before a commit and in CI: lint + check + test + build
mise run sync       # POST /api/sync on the running dev server
mise run site:dev   # MkDocs (Material) docs at http://localhost:8000
mise run site:build # docs build into site/; strict, so a broken link or anchor fails it
```

Narrow first: `mise exec -- vitest run src/lib/mills/board.test.ts`, `mise exec -- oxlint <file>`.
`hk` installs the pre-commit hook (fix mode) on `mise install`.

Lint rules are configured in `.oxlintrc.json`; never add inline ignores. `.astro` files are only
type-checked (`astro check`), not formatted.

## Layout

- `bin/landschaft.js` — CLI for consumers (`dev|build|start`): runs Astro with `root` = this
  package; config, DB and the production build (`dist/`, fully bundled via `ssr.noExternal` in the CLI's build call)
  live in the consumer's cwd. Plain JS, `@ts-check`.
- `src/lib/pacts/` — contracts shared by server and client: `schema.ts` (zod schemas + types:
  config, filters), `types.ts` (runtime data shapes: Issue, Card, Board, SyncStatus),
  `filter.ts` (filter language), `status.ts` (pull status labels), `services.ts` (the services
  gates call, their shared errors), `forge.ts` and `db.ts` (protocols the links implement).
- `src/lib/mills/` — Node-only logic: `board.ts` (**pure** board builder), `sync.ts` (Syncer +
  scheduler), `views.ts` and `config.ts` (the view and config services).
- `src/lib/links/` — Node-only adapters: `config/file.ts` (JSON file, atomic save),
  `db/sqlite.ts` (SQLite), `forge/github/client.ts` (GraphQL transport, token),
  `forge/github/issues.ts` (issue and PR sync queries), `forge/github/ci.ts` (failed CI job queries),
  `forge/github/forge.ts` (`GithubForge`, the `Forge` over those queries).
- `src/lib/inits.ts` — process singleton that wires links into mills; `src/middleware.ts` puts
  its `Services` on `context.locals` (typed in `src/env.d.ts`).
- `src/pages/api/**` — JSON endpoints over `locals.services`, all wrapped in `route()` from
  `_route.ts` (endpoint helpers; Astro skips `_`-prefixed files when routing).
- `src/lib/client/` — fetch wrappers, `useBoard` (polling), URL filters, `move` (list reorder).
- `src/components/board/` and `src/components/settings/` — React islands mounted with
  `client:only="react"` from `src/pages/d/[id].astro` and `src/pages/settings.astro`.

- `docs/` + `mkdocs.yml` — MkDocs Material site (green theme in `docs/assets/extra.css`);
  shared prose is included from README.md through `--8<--` snippet markers.

## Conventions

- Imports run inward: `pacts` import no other layer; `links` and `mills` import `pacts` only;
  gates (`src/pages`, `src/layouts`, `src/components`, `src/lib/client`) import `pacts` and each
  other, and reach services through `locals.services`; `inits.ts` and `middleware.ts` import
  anything. `.oxlintrc.json` enforces this, type imports included, plus `import/no-cycle`. Tests
  and `__fixtures__` are exempt.
- Board logic stays pure and unit-tested in `board.ts`; endpoints only glue.
- Sync is sequential on purpose (rate limits); `no-await-in-loop` is off for that reason.
- Config edits go through `saveConfig()` (validation + tmp-file rename). Ids are immutable
  once saved because they are in URLs.
- Tests live next to the code as `*.test.ts`; fixtures in `src/lib/__fixtures__/`.
- No tests for React forms/components; verify UI in a browser.
