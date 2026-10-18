# How the board works

--8<-- "README.md:grid"

## Placement

--8<-- "README.md:placement"

## Sync

Sync is sequential per repository, on purpose: GitHub's GraphQL rate limit is shared across
everything the token does. Two kinds of pass:

- **Incremental** — issues updated since the last run, every `refreshMinutes`.
- **Full** — every open issue, once a day, for repositories just added in settings, and on
  demand from the full resync button in the top bar.

The top bar shows the sync status on every page, with the remaining rate-limit budget and the
Refresh and full resync buttons. It polls `/api/version`, and an open board reloads itself when a
sync has landed.

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
opened the PR, as long as the PR is in one of the global repos; such an issue card shows a
`PR open` pill. It drops once the PR is merged or closed.

## Failed CI jobs

A job whose newest run on a branch failed shows as a card of its own: a GitHub Actions job, a
check run from another app, or a commit status. The card links to the run and names the
branch, when the job failed and the open PR from the branch, if any. A passing run on the
branch removes it; an old failure stays however long the branch sits untouched.

Every branch counts, but a board shows its jobs only when the branch is one of the global
users': one of them authored a commit the branch has on top of the default branch, or, with
nothing on top, one of its last three commits. A branch with nothing but a bot's commit on
top of main stays off. `author:` and `user:` match those commit authors.

`is:ci-job` picks the jobs, `job:` and `branch:` match job and branch names (any case,
`a|b` for either), and `is:has-pr` holds when an open PR comes from the branch. A catch-all
swimlane or column takes jobs like any other item; `-is:ci-job` in a dashboard's filter keeps
them off it. The search box matches job and branch names, and the CI job filter picks jobs by
name and hides issues; the assignee, label and epic filters hide jobs.

Each sync first reads the head commit status of every branch, then fetches jobs and commit
authors for the failing ones alone. It looks at the head commit only, so a job that skipped
it (a path filter, say) hides an older failure.

## Filters

With more than one global repository, chips in the top bar switch each on or off; `all` turns
every chip on and, once all are on, `none` turns them off. The choice holds on every board, in
this browser, and after a reload. A dashboard with no items in the repositories switched on is
dimmed in the top bar.

Text, assignee, label, epic and sort live in the query string, so a filtered view is a link you
can bookmark or send. Empty values count as unset.
