# How the board works

--8<-- "README.md:grid"

## Placement

--8<-- "README.md:placement"

## Sync

Sync is sequential per repository, on purpose: GitHub's GraphQL rate limit is shared across
everything the token does. Two kinds of pass:

- **Incremental** — issues updated since the last run, every `refreshMinutes`.
- **Full** — every open issue, plus every item updated within the longest `closedDays` of
  any dashboard, once a day, for repositories just added in settings, after a dashboard's
  `closedDays` grows past the longest, and on demand from the full resync button in the top bar.

The top bar shows the sync status on every page, with the remaining rate-limit budget and the
Refresh and full resync buttons. It polls `/api/version`, and an open board reloads itself when a
sync has landed.

## Epics

Open issues carrying the dashboard's `epicLabel` (in any case) are lifted out of the grid into a strip above it,
each with its sub-issue progress from GitHub. Clicking an epic filters the board to its
sub-issues and to issues it blocks or is blocked by; clicking again clears the filter. The ↗ on a tile opens the epic on GitHub.
Pull requests that close the epic or any of those issues (GitHub's "linked pull requests")
are kept as well. A sky `PR` badge on the tile counts the open ones, drafts included.

The ☆ on a tile marks the epic as in active development: it moves to the front of the strip
with an amber accent and an `active` badge; ★ clears it. The mark is kept per dashboard in
the local database, never on GitHub, so a closed epic that is reopened keeps its star.

## Pull requests

Open pull requests are synced alongside issues and placed by the same filters. They carry a `PR` badge and a sky-blue tint (issues green, epics violet, blocked red). Put `is:pr` (or `is:issue`) in a swimlane's or column's filter to split them.

`is:conflicting`, `is:ci:failed`, `is:ci:running`, `is:unanswered` and `is:draft` pick PRs by
merge conflicts, a failed check (GitHub's red ✗ on the last commit), any check still running,
review threads awaiting the author, or draft state; each sync refreshes them for every open PR.

A PR card shows a pill for each status that holds, whatever lane it is in: `conflict`, `CI ✗`,
`CI …`, `comments` or `draft`.

`has:pr` picks issues that an open PR closes (GitHub's "linked pull requests"), whoever
opened the PR, as long as the PR is in one of the global repos; such an issue card shows a
`PR open` pill. It drops once the PR is merged or closed.

## Closed items

A dashboard with `closedDays` above 0 keeps the issues and PRs closed (or merged) within that
many days, placed by the same filters. `is:closed` picks them, so a `Done` column with
`is:closed` gathers them and `-is:closed` keeps them out of a lane. Their cards are greyed
with a `closed` pill, without PR status pills. Epics follow the same window. A closed item
never counts for `has:pr`, `is:blocked` or `is:blocking`, and the unmatched view lists open
items only.

## Failed CI jobs

A job whose newest run on a branch failed shows as a card of its own: a GitHub Actions job, a
check run from another app, or a commit status. The card links to the run and names the
branch, when the job failed and the open PR from the branch, if any. A passing run on the
branch removes it, and so does merging the branch; an old failure stays however long the
branch sits untouched.

Every branch counts, but a board shows its jobs only when the branch is one of the global
users': one of them authored a commit the branch has on top of the default branch, or, with
nothing on top, one of its last three commits. A branch with nothing but a bot's commit on
top of main stays off. `author:` and `user:` match those commit authors.

`is:ci-job` picks the jobs, `job:` and `branch:` match job and branch names (any case,
`a|b` for either), and `has:pr` holds when an open PR comes from the branch. A job carries
that PR's labels: the card shows them, and `label:` and the label filter match them. A catch-all
swimlane, column or inbox group takes jobs like any other item; `-is:ci-job` in a dashboard's
filter keeps them off it. The search box matches job and branch names, and the CI job filter
picks jobs by name and hides issues; the assignee, type and epic filters hide jobs.

Each sync first reads the head commit status of every branch, then fetches jobs and commit
authors for the failing ones and the default branch alone. That status leaves out scheduled
and manually dispatched runs, so on the default branch the sync also reads the head commit's
check suites; on other branches such a run's failure stays off the board. It looks at the head
commit only, so a job that skipped it (a path filter, say) hides an older failure.

## Inbox

An inbox dashboard lists its items instead of laying them out on a grid. Each group has a
filter in the same language; an item lands in the **first** group it matches, so `other` (or an
empty filter) in the last group catches the rest. An item no group takes is left out and shows
on the Unmatched page. PRs, issues and failed CI jobs render as on a board, in the dashboard's
sort.

Each group header shows its count and folds the group away on click; `collapsed` in the config
sets how a group starts on every page load. An inbox has no epic strip.

## Filters

With more than one global repository, chips in the top bar switch each on or off; `all` turns
every chip on and, once all are on, `none` turns them off. The choice is saved in the config as
`hiddenRepos`, so it holds on every board and in every browser. A dashboard with no items in the repositories switched on is
dimmed in the top bar.

Text, assignee, label, type, epic and sort live in the query string, so a filtered view is a
link you can bookmark or send. Empty values count as unset. Type is GitHub's issue type, shown
on each typed card; the type filter hides PRs and jobs.
