# A working setup

Filters can express a lot, so this page shows one real setup: the author's own config, three
dashboards over twelve public repositories. Each dashboard answers one question.

| Dashboard   | Layout | Question                    |
| ----------- | ------ | --------------------------- |
| In progress | inbox  | What needs me now?          |
| Planning    | board  | What do I start next?       |
| Waiting     | board  | What did I park, and where? |

All three set `closedDays: 14`, which keeps items closed in the last 14 days. At the default of
`0`, their Closed lanes and group stay empty; see [Closed items](reference.md#closed-items).

The global scope watches [vekna](https://github.com/fancysnake/vekna),
[tingle](https://github.com/fancysnake/tingle),
[landschaft](https://github.com/fancysnake/landschaft),
[cantare](https://github.com/fancysnake/cantare),
[cabinet](https://github.com/fancysnake/cabinet),
[ludamus](https://github.com/zagrajmy/ludamus),
[acervus](https://github.com/fancysnake/acervus),
[lapidarium](https://github.com/fancysnake/lapidarium),
[fancysnake.dev](https://github.com/fancysnake/fancysnake.dev),
[glimpse-architecture](https://github.com/fancysnake/glimpse-architecture),
[shared-configs](https://github.com/fancysnake/shared-configs) and
[exemplar](https://github.com/fancysnake/exemplar). Its users are `@me`, `dependabot[bot]` and
`renovate[bot]`, so dependency PRs arrive alongside everything else.

## In progress: a queue of actions

An inbox with the filter `-label:pr::wait`, sorted by oldest update first. Each group names what
to do with an item, and an item lands in the first group it matches, so the order is the logic.

| Group       | Filter                                                                                                                               | What it holds                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Closed      | `is:closed is:pr`                                                                                                                    | PRs closed in the last 14 days, folded                                              |
| Ready       | `(-user:@me OR label:qa OR label:v:review:done) is:pr -is:ci:failed -is:conflicting -is:ci:running -label:wontfix -is:unanswered`    | Clean bot PRs, or my own once they passed review: read and merge                    |
| Heal        | `is:pr user:@me`                                                                                                                     | My PRs not yet clean and reviewed: fix CI, conflicts or comments, or get the review |
| Failing job | `-has:pr is:ci-job`                                                                                                                  | Failed CI with no PR to fix it in                                                   |
| Identify    | `user:@me is:issue -is:closed -label:epic -label:l -label:m -label:s -label:feature -label:chore -label:edit -label:bug -is:blocked` | My issues with neither size nor kind: label them so Planning can place them         |
| Broken      | `-user:@me OR has:pr`                                                                                                                | What the groups above let through, folded                                           |

A clean bot PR reaches Ready with no label on GitHub. `user:` matches author or assignee, so a
PR I wrote or am assigned to, which is the only way someone else's PR gets in, also needs `qa` or
`v:review:done`, and stays in Heal until it has one. CI, conflicts and review threads move a PR
in and out of Ready as its state changes.

My issue with only a size or only a kind, and no PR, fits neither In progress nor Planning, so it
shows on Unmatched.

## Planning: pick by what lags

A board over `user:@me is:issue -label:pr::wait`. Its columns are kinds of work, not stages, and
its lanes are sizes, so an issue moves only when it gets a PR or closes.

| Lane    | Filter                          | Settings             |
| ------- | ------------------------------- | -------------------- |
| Closed  | `is:closed`                     | Starts collapsed     |
| With PR | `has:pr -is:closed`             | Hides blocked        |
| Epics   | `label:epic -has:pr -is:closed` | Fluid, hides blocked |
| L       | `label:L -has:pr -is:closed`    | Fluid, hides blocked |
| M       | `label:M -has:pr -is:closed`    | Fluid, hides blocked |
| S       | `label:S -has:pr -is:closed`    | Fluid, hides blocked |

The columns are Bugs, Features, Edits and Chores, each `is:issue label:<kind>`.

The routine has two steps:

1. Read the folded Closed lane. Its count per column shows what got done lately, and it marks
   the lowest. When every column ties it marks none, and any column will do.
2. Go to that column and take the first unfinished item. The fluid lanes share one list in lane
   order, so epics come before L, then M, then S.

Work stays balanced across the four kinds without a rule about it.

## Waiting: a parking lot

A board over `label:pr::wait`, the label the other two dashboards filter out. Putting it on an
item parks it. A failed CI job carries the labels of the PR from its branch, so it parks along
with that PR.

Its columns split items by what they are: PR (`is:pr`), Job (`is:ci-job`) and Issue (`is:issue`).
Its lanes are a folded Closed (`is:closed`) and one with an empty filter that takes everything,
closed items included, so a closed parked item shows in both.

The label comes off when the wait ends, and the item returns to In progress or Planning.
