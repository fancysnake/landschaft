# Configuration

`landschaft.config.json` holds every dashboard. The Settings page edits it through the API;
the file is plain JSON you can also edit by hand (it is validated on load and on save):

```json
--8<-- "landschaft.config.example.json"
```

## Dashboard

| Field            | Type                                       | Default                              | Meaning                                                                                         |
| ---------------- | ------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `id`             | `[a-z0-9_-]{1,32}`                         | required                             | In the URL (`/d/:id`); immutable once saved                                                     |
| `name`           | string                                     | required                             | Shown in the header                                                                             |
| `repos`          | `owner/repo[]`, at least one               | required                             | Repositories whose open issues and pull requests appear                                         |
| `users`          | `(login \| "@me")[]`                       | `["@me"]`                            | Only items these users created or are assigned to; `@me` = the token's account, `[]` = everyone |
| `epicLabel`      | string                                     | none                                 | Issues with this label form the epic strip above the board                                      |
| `sort`           | `{ by: created\|updated, dir: asc\|desc }` | `{ "by": "updated", "dir": "desc" }` | Default card order; the URL can override it                                                     |
| `refreshMinutes` | 1–1440                                     | `5`                                  | Background sync interval; the smallest across dashboards wins per repo                          |
| `swimlanes`      | `Swimlane[]`, at least one                 | required                             | Rows                                                                                            |
| `columns`        | `Column[]`, at least one                   | required                             | Columns                                                                                         |

## Swimlane and column

| Field         | Type                | Default  | Meaning                                                                  |
| ------------- | ------------------- | -------- | ------------------------------------------------------------------------ |
| `id`          | `[a-z0-9_-]{1,32}`  | required | Unique within its axis; keys the board's cells                           |
| `name`        | string              | required | Header text                                                              |
| `filter`      | string              | `""`     | Items this entry takes, in GitHub search syntax; **empty = catch-all**   |
| `hideBlocked` | boolean (swimlanes) | `false`  | Drop issues with at least one open blocker, and show how many it dropped |

A filter combines terms such as `label:prio:high`, `is:pr`, `is:ci:failed` or `user:@me`; see
[How the board works](board.md#placement) for the syntax and every term.

Rules the validator enforces: ids are unique per axis and across dashboards, each filter parses,
and each axis has at most one catch-all.

Configs from before filters keep loading: `labels`, `match` and `kind` turn into a filter
(`any` → `label:a|b`, `all` → `label:a label:b`, `kind` → `is:pr …`), and the next save
writes it.

## Files and environment

| What        | Where                                                      |
| ----------- | ---------------------------------------------------------- |
| Dashboards  | `./landschaft.config.json` (`LANDSCHAFT_CONFIG` overrides) |
| Issue cache | `./landschaft.db` (`LANDSCHAFT_DB` overrides), git-ignored |
| Token       | `GITHUB_TOKEN`, else `gh auth token`                       |

Paths are relative to the directory the command runs in. Saves go through a temp file and a
rename, so a crash never leaves a half-written config.
