# How it works

Astro 7 in SSR mode (`@astrojs/node`, standalone) with React 19 islands, Tailwind 4, a
`node:sqlite` cache and a JSON config file. No database server, no auth, no build step for
consumers beyond installing the package.

- `bin/landschaft.js` — the CLI. Points Astro's `root` at the installed package, so the
  bundled `astro.config.mjs` and `src/` are used while config and cache come from the
  directory the command runs in.
- `src/lib/schema.ts` — zod schemas shared by server and client: config, filters, move and
  sync requests. The types are inferred from them.
- `src/lib/server/config.ts` — load and atomic save of `landschaft.config.json`.
- `src/lib/server/db.ts` — SQLite schema and queries (issues, blockers, labels, sync state).
- `src/lib/server/github.ts` — GraphQL sync queries and REST label writes; token from
  `GITHUB_TOKEN` or `gh auth token`.
- `src/lib/server/sync.ts` — the `Syncer` (sequential, incremental and full passes) and the
  scheduler that follows `refreshMinutes`.
- `src/lib/server/board.ts` — the **pure** board builder and `labelDiffForMove`. Everything
  about placement lives here and is unit-tested against fixtures.
- `src/lib/server/app.ts` — one DB handle, GitHub client and scheduler per process, booted by
  `src/middleware.ts` on the first request and surviving Vite HMR.
- `src/pages/api/**` — thin JSON endpoints wrapped in `route()` from `api.ts`.
- `src/lib/client/` — fetch wrappers, `useBoard` (polling plus optimistic move), URL filters,
  drag and drop.
- `src/components/board/`, `src/components/settings/` — React islands mounted with
  `client:only="react"` from `src/pages/d/[id].astro` and `src/pages/settings.astro`.

Why these shapes:

- **Labels as the only state on GitHub.** No Projects board, no custom fields: a dashboard is
  a view over labels any repo already has, and works for repositories you do not own.
- **Diff, never replace.** A move removes and adds specific labels by name, so concurrent
  edits elsewhere survive.
- **Sequential sync.** GitHub's GraphQL budget is per token; running repositories one after
  another keeps the board usable instead of fast-then-throttled.
- **Cache in SQLite, truth on GitHub.** The database is disposable; deleting it costs one full
  sync.
