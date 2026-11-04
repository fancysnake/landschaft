# How it works

Astro 7 in SSR mode (`@astrojs/node`, standalone) with React 19 islands, Tailwind 4, a
`node:sqlite` cache and a JSON config file. No database server, no auth. Consumers run
`landschaft dev` straight after installing; production needs `landschaft build` before
`landschaft start`.

- `bin/landschaft.js` — the CLI. Points Astro's `root` at the installed package, so the
  bundled `astro.config.mjs` and `src/` are used while config and cache come from the
  directory the command runs in.
- `src/lib/pacts/` — contracts shared by server and client, one module per noun or port:
  `config.ts` (config zod schemas and upgrades), `web.ts` (API request shapes), `issues.ts`,
  `views.ts` and `sync.ts` (runtime data shapes), `filter.ts` (the filter language).
- `src/lib/links/config/file.ts` — load and atomic save of `landschaft.config.json`.
- `src/lib/links/db/sqlite.ts` — SQLite schema and queries (issues, blockers, labels, failed CI jobs, sync state).
- `src/lib/links/forge/github/` — GraphQL transport (`client.ts`, token from `GITHUB_TOKEN` or
  `gh auth token`), issue and PR sync queries (`issues.ts`) and failed CI jobs (`ci.ts`).
- `src/lib/specs.ts` — business constants the sync obeys (full-sync age, `since` overlap, rate
  floor); only `mills` read them.
- `src/lib/mills/sync.ts` — the `Syncer`: sequential, incremental and full passes, and which
  repo syncs next: the stalest past `refreshMinutes`, one per the interval split by the repos.
- `src/lib/gates/timer/node.ts` — the timer that asks the `Syncer` for a due sync every five seconds.
- `src/lib/mills/board.ts` — the **pure** board builder. Everything
  about placement lives here and is unit-tested against fixtures.
- `src/lib/inits.ts` — one DB handle, GitHub client and timer per process, booted by
  `src/middleware.ts` on the first request and surviving Vite HMR; also the view and nav data
  read over them.
- `src/pages/api/**` — thin JSON endpoints wrapped in `route()` from `_route.ts`; each
  names the service errors it answers and with which status.
- `src/lib/client/` — fetch wrappers, `useBoard` (polling), URL filters.
- `src/components/board/`, `src/components/settings/` — React islands mounted with
  `client:only="react"` from `src/pages/d/[id].astro` and `src/pages/settings.astro`.

Why these shapes:

- **Labels as the only state on GitHub.** No Projects board, no custom fields: a dashboard is
  a view over labels any repo already has, and works for repositories you do not own.
- **Sequential sync.** GitHub's GraphQL budget is per token; running repositories one after
  another keeps the board usable instead of fast-then-throttled.
- **Cache in SQLite, truth on GitHub.** The database is disposable; deleting it costs one full
  sync.
