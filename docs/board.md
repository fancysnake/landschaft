# How the board works

--8<-- "README.md:grid"

## Placement

--8<-- "README.md:placement"

## Sync

Sync is sequential per repository, on purpose: GitHub's GraphQL rate limit is shared across
everything the token does. Three kinds of pass:

- **Incremental** — issues updated since the last run, every `refreshMinutes`.
- **Full** — every open issue, once a day, for repositories just added to a dashboard, and on
  demand from the sync button on the board.
- **Single issue** — after a drag, the moved issue is refetched so the board reflects GitHub
  rather than an optimistic guess.

The remaining rate-limit budget is shown next to the sync status. The board polls
`/api/version` and reloads itself when a sync has landed.

## Dragging

A drop computes a label diff, never a full label list: remove the source entry's labels the
issue carries, add what the target entry needs (its first label, or every label for an `all`
entry). Two people editing labels in parallel therefore do not clobber each other. The card
moves immediately; if GitHub rejects the change it snaps back and the error is shown.

## Epics

Issues carrying the dashboard's `epicLabel` are lifted out of the grid into a strip above it,
each with its sub-issue progress from GitHub. Clicking an epic filters the board to its
children (issues whose parent is that epic); clicking again clears the filter.

## Filters

Text, assignee, label, epic and sort live in the query string, so a filtered view is a link
you can bookmark or send. Empty values count as unset.
