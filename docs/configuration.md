# Configuration

`landschaft.config.json` holds every dashboard. The Settings page edits it through the API;
the file is plain JSON you can also edit by hand (it is validated on load and on save):

```json
--8<-- "landschaft.config.example.json"
```

## Dashboard

| Field            | Type                                       | Default                              | Meaning                                                                |
| ---------------- | ------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------- |
| `id`             | `[a-z0-9_-]{1,32}`                         | required                             | In the URL (`/d/:id`); immutable once saved                            |
| `name`           | string                                     | required                             | Shown in the header                                                    |
| `repos`          | `owner/repo[]`, at least one               | required                             | Repositories whose open issues appear                                  |
| `scope`          | `"mine"` \| `"all"`                        | `"mine"`                             | `mine`: issues you created or are assigned to (the token's account)    |
| `epicLabel`      | string                                     | none                                 | Issues with this label form the epic strip above the board             |
| `sort`           | `{ by: created\|updated, dir: asc\|desc }` | `{ "by": "updated", "dir": "desc" }` | Default card order; the URL can override it                            |
| `refreshMinutes` | 1–1440                                     | `5`                                  | Background sync interval; the smallest across dashboards wins per repo |
| `swimlanes`      | `Swimlane[]`, at least one                 | required                             | Rows                                                                   |
| `columns`        | `Column[]`, at least one                   | required                             | Columns                                                                |

## Swimlane and column

| Field         | Type                | Default  | Meaning                                                     |
| ------------- | ------------------- | -------- | ----------------------------------------------------------- |
| `id`          | `[a-z0-9_-]{1,32}`  | required | Unique within its axis; used in the move API                |
| `name`        | string              | required | Header text                                                 |
| `labels`      | string[]            | `[]`     | Labels this entry matches; **empty = catch-all**            |
| `match`       | `"any"` \| `"all"`  | `"any"`  | `any`: at least one of the labels; `all`: every one of them |
| `hideBlocked` | boolean (swimlanes) | `false`  | Drop issues with at least one open blocker                  |

Rules the validator enforces: ids are unique per axis and across dashboards, and each axis has
at most one catch-all. See [How the board works](board.md) for what the labels do.

## Files and environment

| What        | Where                                                      |
| ----------- | ---------------------------------------------------------- |
| Dashboards  | `./landschaft.config.json` (`LANDSCHAFT_CONFIG` overrides) |
| Issue cache | `./landschaft.db` (`LANDSCHAFT_DB` overrides), git-ignored |
| Token       | `GITHUB_TOKEN`, else `gh auth token`                       |

Paths are relative to the directory the command runs in. Saves go through a temp file and a
rename, so a crash never leaves a half-written config.
