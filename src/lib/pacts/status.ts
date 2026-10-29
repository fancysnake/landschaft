/** PR states the sync reads from GitHub for every open PR. */
export const PULL_STATUS_NAMES = [
  "is:conflicting",
  "is:ci:failed",
  "is:ci:running",
  "is:unanswered",
  "is:draft",
] as const;
export type PullStatusLabel = (typeof PULL_STATUS_NAMES)[number];

export function isPullStatusLabel(name: string): name is PullStatusLabel {
  return (PULL_STATUS_NAMES as readonly string[]).includes(name);
}

/** `label` as the value of an `is:` filter term: `is:draft` → `draft`. */
export const statusValue = (label: PullStatusLabel) => label.replace(/^is:/, "");
