# API

All endpoints return JSON and carry no authentication: the server is meant to listen on
localhost only. Errors are `{ "error": "message" }` with a matching status.

| Route                           | Purpose                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `GET /api/config`               | The whole config, defaults filled in                         |
| `PUT /api/config`               | Replace the whole config; validated, saved atomically        |
| `GET /api/dashboards/:id/board` | Computed board; the query string is the filter set           |
| `POST /api/sync`                | `{ "repo"?: "owner/repo", "full"?: true }`; `409` while busy |
| `GET /api/version`              | Sync status per repository plus rate-limit budget            |
| `GET /api/labels?repos=a/b,c/d` | Cached label catalogue for the pickers                       |
| `POST /api/move`                | Apply a drag: label diff on GitHub, then refetch the issue   |

## Move

```json
{
  "dashboardId": "main",
  "repo": "owner/repo",
  "number": 42,
  "from": { "laneId": "normal", "colId": "backlog" },
  "to": { "laneId": "high", "colId": "doing" }
}
```

The server recomputes the diff from the dashboard definition, so a stale client cannot add
labels the target entry does not ask for. GitHub writes go through REST by label name.

## Board

`GET /api/dashboards/:id/board?q=&assignee=&label=&epic=&sort=updated&dir=desc` returns the
grid as cells keyed by swimlane and column id, the epic strip, the unplaced count and the
label catalogue used for colouring. The React island renders it as-is; all placement logic is
server-side and unit-tested.
