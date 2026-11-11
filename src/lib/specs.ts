/** A repo's sync is full, closing what GitHub no longer lists, once its last full one is this old. */
export const FULL_SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** How far an incremental sync reaches back before the last one, for items updated mid-sync. */
export const SINCE_OVERLAP_MS = 2 * 60 * 1000;

/** A repo synced within this long is skipped by a sync that asks for the stale repos only. */
export const FRESH_SYNC_MS = 60 * 1000;

/** The GitHub rate limit a sync aborts below rather than run it dry. */
export const RATE_FLOOR = 200;
