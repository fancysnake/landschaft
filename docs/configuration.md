# Configuration

`landschaft.config.json` holds the repositories to watch and every dashboard. The Settings page edits it through the API;
the file is plain JSON you can also edit by hand (it is validated on load and on save):

```json
--8<-- "landschaft.config.example.json"
```

## Global

The open items in `repos` that `users` created or are assigned to form the base set every
dashboard filters.

| Field            | Type                 | Default | Meaning                                                              |
| ---------------- | -------------------- | ------- | -------------------------------------------------------------------- |
| `repos`          | `owner/repo[]`       | `[]`    | Repositories to sync                                                 |
| `users`          | `(login \| "@me")[]` | `[]`    | Only items these users created or are assigned to; `[]` = everyone's |
| `refreshMinutes` | 1–1440               | `5`     | Background sync interval for every repository                        |
| `dashboards`     | `Dashboard[]`        | `[]`    | Boards                                                               |

`@me` stands for the account behind the token.

## Dashboard

| Field       | Type                                       | Default                              | Meaning                                                                         |
| ----------- | ------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------- |
| `id`        | `[a-z0-9_-]{1,32}`                         | required                             | In the URL (`/d/:id`); immutable once saved                                     |
| `name`      | string                                     | required                             | Shown in the header                                                             |
| `filter`    | string                                     | `""`                                 | Narrows the base set, e.g. `repo:acme/app\|acme/lib user:@me`; `""` = all of it |
| `epicLabel` | string                                     | none                                 | Issues with this label form the epic strip above the board                      |
| `sort`      | `{ by: created\|updated, dir: asc\|desc }` | `{ "by": "updated", "dir": "desc" }` | Default card order; the URL can override it                                     |
| `swimlanes` | `Swimlane[]`, at least one                 | required                             | Rows                                                                            |
| `columns`   | `Column[]`, at least one                   | required                             | Columns                                                                         |

## Swimlane and column

| Field         | Type                | Default  | Meaning                                                                                                                                                                                               |
| ------------- | ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | `[a-z0-9_-]{1,32}`  | required | Unique within its axis; keys the board's cells                                                                                                                                                        |
| `name`        | string              | required | Header text                                                                                                                                                                                           |
| `filter`      | string              | `other`  | Items this entry takes, in GitHub search syntax; `""` = everything, `other` = what no lane above / column to the right took; omitted = `other` minus a `-(…)` for each entry `other` does not look at |
| `hideBlocked` | boolean (swimlanes) | `false`  | Drop issues with at least one open blocker, and show how many it dropped                                                                                                                              |

A filter combines terms such as `label:prio:high`, `is:pr`, `is:ci:failed` or `user:@me`; see
[How the board works](board.md#placement) for the syntax and every term.

Rules the validator enforces: ids are unique per axis and across dashboards, each filter
parses, and a dashboard filter does not use `other`.

Configs from before filters keep loading: `labels`, `match` and `kind` turn into a filter
(`any` → `label:a|b`, `all` → `label:a label:b`, `kind` → `is:pr …`, no labels → `other` minus the entries it does not look at), and the next save
writes it.

Configs from before global repos keep loading too. The global repos and users become the
unions of the dashboards' (users stay empty if any dashboard showed everyone's), the refresh
interval the shortest any dashboard had, and a dashboard narrower than that gets a matching
`repo:`/`user:` filter.

## Files and environment

| What        | Where                                                      |
| ----------- | ---------------------------------------------------------- |
| Dashboards  | `./landschaft.config.json` (`LANDSCHAFT_CONFIG` overrides) |
| Issue cache | `./landschaft.db` (`LANDSCHAFT_DB` overrides), git-ignored |
| Token       | `GITHUB_TOKEN`, else `gh auth token`                       |

Paths are relative to the directory the command runs in. Saves go through a temp file and a
rename, so a crash never leaves a half-written config.
