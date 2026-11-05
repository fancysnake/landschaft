import type { SyncService } from "../../pacts/services";

/** Asks `sync` for a due sync every tick; `tickMs` floors their spacing. Returns a stop function. */
export function startTimer(
  sync: Pick<SyncService, "syncDue">,
  options: { tickMs?: number; firstDelayMs?: number } = {},
): () => void {
  let stopped = false;
  const tick = () => {
    if (!stopped) void sync.syncDue();
  };
  const first = setTimeout(tick, options.firstDelayMs ?? 1000);
  const interval = setInterval(tick, options.tickMs ?? 5000);
  first.unref();
  interval.unref();
  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(interval);
  };
}
