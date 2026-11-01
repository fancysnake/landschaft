import { describe, expect, it } from "vitest";

import { syncAge } from "./labels";

describe("syncAge", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

  it("grades the age in refresh intervals", () => {
    expect(syncAge(ago(10), 5, now)).toBe("fresh");
    expect(syncAge(ago(11), 5, now)).toBe("late");
    expect(syncAge(ago(30), 5, now)).toBe("late");
    expect(syncAge(ago(31), 5, now)).toBe("stale");
  });

  it("counts a repo never synced as stale", () => {
    expect(syncAge(null, 5, now)).toBe("stale");
  });
});
