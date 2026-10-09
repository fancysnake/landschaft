# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog], and this project adheres to
[Semantic Versioning].

## [Unreleased]

## [1.0.0] - 2026-10-09

### Added

- Swimlanes and columns pick items with a filter in GitHub search syntax (`label:a|b -is:pr`,
  `OR`, parens), with terms for blockers, parents, sub-issues, repos and people. Settings
  checks each filter as you type and suggests terms and label names.

### Changed

- An item shows in every swimlane and column whose filter it matches, not only the first lane
  and last column.
- An empty filter matches every item. The term `other` holds for items no swimlane above, or
  no column to the right, matched: `other` alone makes the bottom swimlane or the leftmost
  column a catch-all, and `other label:b` below a `label:a` lane takes the `b` items that lane
  did not.
- Labels, the epic label among them, match by name, ignoring case.
- `labels`, `match` and `kind` on swimlanes and columns become `filter`; old configs convert
  on load, a catch-all to `other` minus the entries `other` does not look at.

### Removed

- Drag and drop on the board, with `POST /api/move` and every GitHub label write. The board is
  read-only; the token needs read access only.

## [0.10.1] - 2026-10-05

### Fixed

- `is:ci:failed` flags a PR whenever its last commit shows GitHub's red ✗, failed optional checks
  included.

## [0.10.0] - 2026-10-05

### Added

- `is:has-pr` matches issues an open PR closes, with a `PR open` pill on their cards.

## [0.9.1] - 2026-10-04

### Fixed

- `is:ci:failed` counts every check until one reports as required.
- `is:ci:running` flags a PR while any of its checks runs.

## [0.9.0] - 2026-10-03

### Added

- The ☆ on an epic tile marks it as in active development; marked epics lead the strip with an
  amber accent, kept per dashboard in the local database.
- Repo chips get an `all` / `none` switch, and the last chip on can be switched off too.

### Changed

- `is:ci:failed` and `is:ci:running` count `codecov/*` checks even when they are optional.
- A dashboard's `users` (GitHub logins, `@me` for the token's account) choose whose issues and
  pull requests it shows, replacing `scope`; `scope` still loads, `mine` as `["@me"]` and `all`
  as `[]`.

## [0.8.0] - 2026-10-03

### Added

- PR cards show a pill for each status that holds: merge conflict, CI failed, CI running and
  unanswered review comments.

### Changed

- `is:ci-not-ok` splits into `is:ci:failed` (a required check failed) and `is:ci:running` (a
  required check has not finished); configs using `is:ci-not-ok` no longer load.

## [0.7.0] - 2026-10-02

### Added

- PR status labels `is:conflicting`, `is:ci-not-ok` (required checks only) and `is:unanswered`
  (unresolved review threads the author has not answered) match like labels; each sync
  refreshes them for every open PR.

### Changed

- The config rejects any `is:` label other than the PR status labels, and a GitHub label named
  like a status no longer matches it.

## [0.6.0] - 2026-10-02

### Added

- A column takes only issues or only pull requests with `"kind": "issue"` or `"pr"`.

### Changed

- A card carrying the labels of several columns sits in the last of them, not the first;
  swimlanes still take the first match.
- The settings editor sets a swimlane's or column's kind with an `is:issue` / `is:pr` chip in
  its label picker, replacing the select.

## [0.5.0] - 2026-09-29

### Added

- A swimlane takes only issues or only pull requests with `"kind": "issue"` or `"pr"`.
- Cards are tinted by type: blocked red, epic violet, pull request sky, issue green.

### Fixed

- `POST /api/move` refuses a drop an earlier swimlane or column would capture, instead of
  editing labels for a card that lands elsewhere.

## [0.4.0] - 2026-09-29

### Added

- Open pull requests appear on the board with a `PR` badge, and an epic's view includes those
  linked to it or its issues; upgrading forces a full resync to fetch them.

### Changed

- The repo filter is a row of chips that switch repos off independently; `repo` takes a
  comma-separated list.

## [0.3.0] - 2026-09-27

### Added

- `repo` filter on boards that span more than one repository.
- Epic tiles carry a link that opens the epic on GitHub.

## [0.2.0] - 2026-09-26

### Changed

- Selecting an epic also shows the issues it blocks and the issues blocking it, next to its
  sub-issues.

## [0.1.1] - 2026-09-26

### Added

- Documentation site at <https://landschaft.fancysnake.dev>: getting started, configuration,
  board rules, API and architecture, published from `main` by CI.

### Fixed

- `landschaft start` runs from a consumer directory: `landschaft build` writes a self-contained
  server into `./dist` next to `landschaft.config.json`, and `start` serves it from there.

## [0.1.0] - 2026-09-25

- Initial release.

<!-- Links -->

[keep a changelog]: https://keepachangelog.com/en/1.1.0/
[semantic versioning]: https://semver.org/spec/v2.0.0.html

<!-- Versions -->

[unreleased]: https://github.com/fancysnake/landschaft/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/fancysnake/landschaft/compare/v0.10.1...v1.0.0
[0.10.1]: https://github.com/fancysnake/landschaft/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/fancysnake/landschaft/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/fancysnake/landschaft/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/fancysnake/landschaft/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/fancysnake/landschaft/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/fancysnake/landschaft/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/fancysnake/landschaft/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/fancysnake/landschaft/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/fancysnake/landschaft/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/fancysnake/landschaft/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/fancysnake/landschaft/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/fancysnake/landschaft/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/fancysnake/landschaft/releases/tag/v0.1.0
