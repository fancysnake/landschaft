# API

All endpoints return JSON and carry no authentication: the server is meant to listen on
localhost only. Errors are `{ "error": "message" }` with a matching status.

| Route                           | Purpose                                                                 |
| ------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/config`               | The whole config, defaults filled in                                    |
| `PUT /api/config`               | Replace the whole config but `hiddenRepos`; validated, saved atomically |
| `POST /api/hidden-repos`        | `{ "repos", "hidden" }`; switches repositories off or on                |
| `GET /api/dashboards/:id/board` | Computed board; the query string is the filter set                      |
| `GET /api/dashboards/:id/inbox` | Computed inbox; same query string as the board                          |
| `GET /api/unmatched?filter=`    | Open items no dashboard places; see [Board](#board)                     |
| `POST /api/sync`                | `{ "repos"?, "full"? }`; see [Sync](#sync)                              |
| `GET /api/version`              | Sync status per repository plus rate-limit budget                       |
| `GET /api/labels?repos=a/b,c/d` | Cached label catalogue for the pickers                                  |
| `GET /api/nav`                  | Nav tabs with their repos, global and hidden repos, refresh interval    |

## Board

`GET /api/dashboards/:id/board?q=&assignee=&label=&type=&epic=&sort=updated&dir=desc`
returns the grid as cells keyed by swimlane and column id, the epic strip, the repositories
among the dashboard's items with the `hidden` ones among them, whose items it leaves out, and the
label catalogue used for colouring. The React island renders it as-is; all placement logic is
server-side and unit-tested.

`GET /api/dashboards/:id/inbox` takes the same query string and returns the inbox's cards by
group id, with the same repositories, label catalogue and sort. Each endpoint answers `404` for
a dashboard of the other type.

`GET /api/unmatched?filter=` returns `{ "items", "offer", "status" }`: the open items of
the global users that no dashboard places in a cell or inbox group, most recently updated first,
as cards shaped like the board's with every label, leaving out hidden repositories; `filter` takes a
dashboard filter expression; `offer` holds the repos, labels and users the filter box suggests.

`POST /api/dashboards/:id/starred-epics` with `{ "epic": "owner/repo#12", "starred": true }`
marks the epic as in active development (`false` clears the mark) and returns the dashboard's
`starredEpics`. Starring rejects an epic outside the global repositories with `400`.

`POST /api/hidden-repos` with `{ "repos": ["owner/repo"], "hidden": true }` switches those
repositories off on every view (`false` switches them back on) and returns the config's
`hiddenRepos`. A repository outside the global ones is rejected with `400`.

## Sync

`POST /api/sync` syncs every configured repository in the background, or with
`{ "repos": ["owner/repo"] }` just those, and answers `202` with `{ "status", "run" }` at once,
never `409`; a repository that is not configured is refused with `400`. `"full": true` refetches
every open issue instead of only those changed since the last sync. A call during a running
sync-all joins that run and adds its repositories to it. Follow progress by polling
`GET /api/version`: a repository is waiting while it is in `queued` and busy while it is in
`inFlight`, the run is done once `runs`
reaches `run`, and its failures land in `lastError`.
