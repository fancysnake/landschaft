# How the board works

--8<-- "README.md:grid"

## Placement

--8<-- "README.md:placement"

## Sync

Sync is sequential per repository, on purpose: GitHub's GraphQL rate limit is shared across
everything the token does. Two kinds of pass:

- **Incremental** — issues updated since the last run, every `refreshMinutes`.
- **Full** — every open issue, once a day, for repositories just added to a dashboard, and on
  demand from the sync button on the board.

The remaining rate-limit budget is shown next to the sync status. The board polls
`/api/version` and reloads itself when a sync has landed.

## Epics

Issues carrying the dashboard's `epicLabel` (in any case) are lifted out of the grid into a strip above it,
each with its sub-issue progress from GitHub. Clicking an epic filters the board to its
sub-issues and to issues it blocks or is blocked by; clicking again clears the filter. The ↗ on a tile opens the epic on GitHub.
Pull requests that close the epic or any of those issues (GitHub's "linked pull requests")
are kept as well.

The ☆ on a tile marks the epic as in active development: it moves to the front of the strip
with an amber accent and an `active` badge; ★ clears it. The mark is kept per dashboard in
the local database, never on GitHub, so a closed epic that is reopened keeps its star.

## Pull requests

Open pull requests are synced alongside issues and placed by the same filters. They carry a `PR` badge and a sky-blue tint (issues green, epics violet, blocked red). Put `is:pr` (or `is:issue`) in a swimlane's or column's filter to split them.

`is:conflicting`, `is:ci:failed`, `is:ci:running` and `is:unanswered` pick PRs by merge
conflicts, a failed check (GitHub's red ✗ on the last commit), any check still running, or review
threads awaiting the author; each sync refreshes them for every open PR.

A PR card shows a pill for each status that holds, whatever lane it is in: `conflict`, `CI ✗`,
`CI …` or `comments`.

`is:has-pr` picks issues that an open PR closes (GitHub's "linked pull requests"), whoever
opened the PR, as long as the PR is in one of the dashboard's repos; such an issue card shows a
`PR open` pill. It drops once the PR is merged or closed.

## Filters

On multi-repo boards, chips above the board switch each repository on or off
(`repo=owner/a,owner/b`); `all` turns every chip on and, once all are on, `none` turns them off.

Text, repos, assignee, label, epic and sort live in the query string, so a filtered view is a link
you can bookmark or send. Empty values count as unset, except `repo=`, which shows no repository.
