import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startTimer } from "./node";

describe("startTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("syncs the due repos after the first delay and on every tick until stopped", async () => {
    const sync = { syncDue: vi.fn(async () => {}) };
    const stop = startTimer(sync, { tickMs: 60_000, firstDelayMs: 1000 });

    await vi.advanceTimersByTimeAsync(999);
    expect(sync.syncDue).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(sync.syncDue).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sync.syncDue).toHaveBeenCalledTimes(3);

    stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(sync.syncDue).toHaveBeenCalledTimes(3);
  });
});
