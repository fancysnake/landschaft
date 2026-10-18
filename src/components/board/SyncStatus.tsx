import { useEffect, useState } from "react";

import type { SyncStatus as Status } from "../../lib/types";

import { relativeTime } from "../../lib/client/labels";

interface Props {
  status: Status;
  syncing: boolean;
  /** A failed sync request, or the error the sync it started finished with. */
  error: string | null;
  onSync(full: boolean): void;
  onDismissError(): void;
}

export function SyncStatus({ status, syncing, error, onSync, onDismissError }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const busy = syncing || status.inFlight.length > 0;
  return (
    <div className="group flex items-center gap-2 text-sm text-neutral-600">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          busy ? "animate-pulse bg-sky-500" : status.lastError ? "bg-red-500" : "bg-emerald-500"
        }`}
      />
      <span title={status.lastError ?? undefined}>
        {busy
          ? `Syncing ${status.inFlight.join(", ")}…`
          : `Synced ${relativeTime(status.lastSyncAt, now)}`}
      </span>
      {error && (
        <span className="text-red-700">
          {error}{" "}
          <button type="button" onClick={onDismissError} className="font-medium hover:underline">
            dismiss
          </button>
        </span>
      )}
      {status.rateRemaining !== null && (
        <span
          className="text-xs text-neutral-400 tabular-nums"
          title="GitHub API points left this hour"
        >
          · {status.rateRemaining} left
        </span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => onSync(false)}
        className="rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-xs font-medium text-neutral-700 shadow-xs hover:bg-neutral-50 disabled:opacity-40"
      >
        Refresh
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onSync(true)}
        title="Re-fetch every open issue"
        className="text-xs text-neutral-500 opacity-0 group-hover:opacity-100 hover:underline focus-visible:opacity-100 disabled:text-neutral-300"
      >
        full resync
      </button>
    </div>
  );
}
