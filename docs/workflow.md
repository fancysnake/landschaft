---
description: "A working landschaft setup: three GitHub dashboards, an action queue, a planning board and a parking lot, with every filter and the daily routine."
---

# A working setup

Filters can express a lot, so this page walks through one setup: `landschaft.config.example.json`,
the example config in the repository, modelled on the one the author works from. Copy it to
`landschaft.config.json` and put your own repositories in `repos`. Each of its three dashboards
answers one question.

| Dashboard   | Layout | Question                    |
| ----------- | ------ | --------------------------- |
| In progress | inbox  | What needs me now?          |
| Planning    | board  | What do I start next?       |
| Waiting     | board  | What did I park, and where? |

All three set `closedDays: 14`, which keeps items closed in the last 14 days. At the default of
`0`, their Closed lanes and group stay empty; see [Closed items](reference.md#closed-items).

The global scope has the users `@me`, `dependabot[bot]` and `renovate[bot]`, so dependency PRs
arrive alongside everything else.

The filters lean on a few labels: `wait` parks an item, `reviewed` marks your own PR as
reviewed, `bug`, `feature`, `edit` and `chore` say what kind of work an issue is, and `epic`,
`L`, `M` and `S` say how big it is.

## In progress: a queue of actions

An inbox with the filter `-label:wait`, sorted by oldest update first. Each group names what
to do with an item, and an item lands in the first group it matches, so the order is the logic.

| Group       | Filter                                                                                                                               | Settings         | What it holds                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------- |
| Closed      | `is:closed is:pr`                                                                                                                    | Starts collapsed | PRs closed in the last 14 days                                                        |
| Ready       | `(-user:@me OR label:reviewed) is:pr -is:ci:failed -is:conflicting -is:ci:running -is:unanswered -is:draft`                          | none             | Clean bot PRs, or your own once they passed review: read and merge                    |
| Heal        | `is:pr user:@me`                                                                                                                     | none             | Your PRs not yet clean and reviewed: fix CI, conflicts or comments, or get the review |
| Failing job | `-has:pr is:ci-job`                                                                                                                  | none             | Failed CI with no PR to fix it in                                                     |
| Identify    | `user:@me is:issue -is:closed -label:epic -label:L -label:M -label:S -label:feature -label:chore -label:edit -label:bug -is:blocked` | none             | Your issues with neither size nor kind: label them so Planning can place them         |
| Broken      | `-user:@me OR has:pr`                                                                                                                | Starts collapsed | What the groups above let through                                                     |

A clean bot PR reaches Ready with no label on GitHub. `user:` matches author or assignee, so a
PR you wrote or are assigned to, which is the only way someone else's PR gets in, also needs
`reviewed`, and stays in Heal until it has it. CI, conflicts and review threads move a PR in and
out of Ready as its state changes.

Your issue with only a size or only a kind, and no PR, fits neither In progress nor Planning, so
it shows on Unmatched.

## Planning: pick by what lags

A board over `user:@me is:issue -label:wait`. Its columns are kinds of work, not stages, and
its lanes are sizes, so an issue moves only when it gets a PR or closes.

| Lane    | Filter                          | Settings             |
| ------- | ------------------------------- | -------------------- |
| Closed  | `is:closed`                     | Starts collapsed     |
| With PR | `has:pr -is:closed`             | Hides blocked        |
| Epics   | `label:epic -has:pr -is:closed` | Fluid, hides blocked |
| L       | `label:L -has:pr -is:closed`    | Fluid, hides blocked |
| M       | `label:M -has:pr -is:closed`    | Fluid, hides blocked |
| S       | `label:S -has:pr -is:closed`    | Fluid, hides blocked |

| Column   | Filter          |
| -------- | --------------- |
| Bugs     | `label:bug`     |
| Features | `label:feature` |
| Edits    | `label:edit`    |
| Chores   | `label:chore`   |

The routine has two steps:

1. Read the folded Closed lane. Its count per column shows what got done lately, and it marks
   the lowest. When every column ties it marks none, and any column will do.
2. Go to that column and take the first unfinished item. The fluid lanes share one list in lane
   order, so epics come before L, then M, then S.

Work stays balanced across the four kinds without a rule about it.

## Waiting: a parking lot

A board over `label:wait`, the label the other two dashboards filter out. Putting it on an item
parks it. A failed CI job carries the labels of the PR from its branch, so it parks along with
that PR.

Its columns split items by what they are.

| Column | Filter      |
| ------ | ----------- |
| PR     | `is:pr`     |
| Job    | `is:ci-job` |
| Issue  | `is:issue`  |

The Everything lane has no filter and takes every item, closed ones included, so a closed parked
item shows in both lanes.

| Lane       | Filter      | Settings         |
| ---------- | ----------- | ---------------- |
| Closed     | `is:closed` | Starts collapsed |
| Everything | none        | none             |

The label comes off when the wait ends, and the item returns to In progress or Planning.
