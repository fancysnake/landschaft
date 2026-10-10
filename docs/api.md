# API

All endpoints return JSON and carry no authentication: the server is meant to listen on
localhost only. Errors are `{ "error": "message" }` with a matching status.

| Route                           | Purpose                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `GET /api/config`               | The whole config, defaults filled in                         |
| `PUT /api/config`               | Replace the whole config; validated, saved atomically        |
| `GET /api/dashboards`           | Each dashboard's id and the repositories among its items     |
| `GET /api/dashboards/:id/board` | Computed board; the query string is the filter set           |
| `POST /api/sync`                | `{ "repo"?: "owner/repo", "full"?: true }`; `409` while busy |
| `GET /api/version`              | Sync status per repository plus rate-limit budget            |
| `GET /api/labels?repos=a/b,c/d` | Cached label catalogue for the pickers                       |

## Board

`GET /api/dashboards/:id/board?q=&hide=&assignee=&label=&epic=&sort=updated&dir=desc`
returns the grid as cells keyed by swimlane and column id, the epic strip, the unplaced count,
the repositories among the dashboard's items and the label catalogue used for colouring.
`hide` lists repositories to leave out. The React island renders it as-is; all placement logic is
server-side and unit-tested.

`POST /api/dashboards/:id/starred-epics` with `{ "epic": "owner/repo#12", "starred": true }`
marks the epic as in active development (`false` clears the mark) and returns the dashboard's
`starredEpics`. Starring rejects an epic outside the global repositories with `400`.
