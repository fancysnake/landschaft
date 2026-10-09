/** PR states the sync reads from GitHub for every open PR. */
export const PULL_STATUS_NAMES = [
  "is:conflicting",
  "is:ci:failed",
  "is:ci:running",
  "is:unanswered",
] as const;
export type PullStatusLabel = (typeof PULL_STATUS_NAMES)[number];

export function isPullStatusLabel(name: string): name is PullStatusLabel {
  return (PULL_STATUS_NAMES as readonly string[]).includes(name);
}

/**
 * States derived from GitHub that filters match with `is:` terms. `is:has-pr` holds for an
 * issue an open PR closes.
 */
export const STATUS_LABEL_NAMES = [...PULL_STATUS_NAMES, "is:has-pr"] as const;
export type StatusLabel = (typeof STATUS_LABEL_NAMES)[number];

export function isStatusLabel(name: string): name is StatusLabel {
  return (STATUS_LABEL_NAMES as readonly string[]).includes(name);
}
