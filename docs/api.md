# API

All endpoints return JSON and carry no authentication: the server is meant to listen on
localhost only. Errors are `{ "error": "message" }` with a matching status.

| Route                           | Purpose                                               |
| ------------------------------- | ----------------------------------------------------- |
| `GET /api/config`               | The whole config, defaults filled in                  |
| `PUT /api/config`               | Replace the whole config; validated, saved atomically |
| `GET /api/dashboards/:id/board` | Computed board; the query string is the filter set    |
| `GET /api/unmatched?hide=a/b`   | Open items no dashboard places; see [Board](#board)   |
| `POST /api/sync`                | `{ "repo"?, "full"? }`; see [Sync](#sync)             |
| `GET /api/version`              | Sync status per repository plus rate-limit budget     |
| `GET /api/labels?repos=a/b,c/d` | Cached label catalogue for the pickers                |

## Board

`GET /api/dashboards/:id/board?q=&hide=&assignee=&label=&epic=&sort=updated&dir=desc`
returns the grid as cells keyed by swimlane and column id, the epic strip, the repositories
among the dashboard's items and the label catalogue used for colouring. `hide` lists
repositories to leave out. The React island renders it as-is; all placement logic is server-side
and unit-tested.

`GET /api/unmatched?hide=` returns `{ "items", "status" }`: the open items of the global users
that no dashboard places in a cell, most recently updated first, as cards shaped like the
board's with every label. `hide` works as on the board.

`POST /api/dashboards/:id/starred-epics` with `{ "epic": "owner/repo#12", "starred": true }`
marks the epic as in active development (`false` clears the mark) and returns the dashboard's
`starredEpics`. Starring rejects an epic outside the global repositories with `400`.

## Sync

`POST /api/sync` with `{ "repo": "owner/repo" }` syncs that repository and answers once it is
done with `{ "results", "status" }`; `"full": true` refetches every open issue instead of only
those changed since the last sync. A repository that is already syncing is refused with `409`.

Without `repo`, every configured repository syncs in the background and the answer is `202` with
`{ "status" }` at once, never `409`; repositories already syncing are skipped. Follow progress
by polling `GET /api/version`: a repository is busy while it is in `inFlight`, and a failure
lands in `lastError`.
