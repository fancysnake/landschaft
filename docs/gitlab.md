---
description: "Read merge requests from a self-managed GitLab instance: the token, the two environment variables, the backend switch, and what differs from GitHub."
---

# GitLab

landschaft can read merge requests from a self-managed GitLab instance in place of GitHub. An
install reads one backend: GitHub, or GitLab. Merge requests show up as pull requests, with the
same filters, lanes and status pills.

## 1. Create a token

In GitLab, open **Edit profile → Access tokens** and add a personal access token with the
`read_api` scope. landschaft only reads.

Use a personal token, not a project or group token. `@me` stands for the account behind the
token, and a project token belongs to a bot account.

## 2. Set the environment

landschaft reads two variables when it syncs:

| Variable       | Value                                               |
| -------------- | --------------------------------------------------- |
| `GITLAB_URL`   | The instance, for example `https://git.example.com` |
| `GITLAB_TOKEN` | The token from step 1                               |

An instance served under a path keeps the path: `https://example.com/gitlab`.

With mise, put them in `mise.local.toml` next to `mise.toml`, and add that file to
`.gitignore`:

```toml
[env]
GITLAB_URL = "https://git.example.com"
GITLAB_TOKEN = "glpat-…"
```

Without mise, export them in the shell that starts landschaft, for example in `~/.bashrc`:

```sh
export GITLAB_URL="https://git.example.com"
export GITLAB_TOKEN="glpat-…"
```

Restart landschaft after you change either variable.

## 3. Switch the backend

Open **Settings**, set **Backend** to GitLab, and replace the repositories with GitLab project
paths. A path can nest: `group/sub/project`. Saving starts the first sync.

The same switch in `landschaft.config.json`:

```json
{
  "backend": "gitlab",
  "repos": ["group/app", "group/sub/project"]
}
```

## Filters for review work

`reviewer:` picks the merge requests a user was asked to review. Two lanes split your own work
from your reviews:

| Lane      | Filter                           |
| --------- | -------------------------------- |
| Mine      | `is:pr author:@me`               |
| To review | `is:pr reviewer:@me -author:@me` |

A card you review and did not open also carries a `review` pill. Review state narrows either
lane: `is:approved`, `is:changes-requested`. For example, `reviewer:@me -author:@me
-is:approved` drops the merge requests GitLab reports approved, unless a reviewer requested
changes. Approval counts for the whole merge request, not for your own review.

With global **Users** set, a dashboard holds the merge requests those users created, are
assigned to or review.

## What a merge request shows

| Filter                 | Holds when                                                     |
| ---------------------- | -------------------------------------------------------------- |
| `is:draft`             | The merge request is a draft                                   |
| `is:conflicting`       | It has merge conflicts                                         |
| `is:ci:failed`         | Its head pipeline failed                                       |
| `is:ci:running`        | Its head pipeline is created, pending or running               |
| `is:unanswered`        | An unresolved thread ends with a note that is not the author's |
| `is:approved`          | GitLab reports it approved, and no reviewer requested changes  |
| `is:changes-requested` | A reviewer requested changes                                   |
| `is:closed`            | It is closed or merged; see the dashboard's `closedDays`       |

A pipeline that waits for a manual job or a schedule counts as neither failed nor running.

## What is not synced

- GitLab issues. `is:issue` and `has:pr` match nothing, and a merge request links to no issue.
- Failed CI jobs as cards of their own. `is:ci-job` matches nothing; the pipeline pills on a
  merge request still work.

The top bar shows the API requests left only when the instance sends rate limit headers.

## When the sync fails

The error shows in the top bar and names the cause:

| Error                                               | Fix                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `No GitLab access: set GITLAB_URL and GITLAB_TOKEN` | Set both variables in the environment landschaft starts in        |
| `GITLAB_URL is not a URL`                           | Include the scheme: `https://git.example.com`                     |
| `GraphQL HTTP 401`                                  | The token is wrong or expired; create a new one                   |
| `project … not found or not accessible`             | Check the path, and that the token's account can open the project |
