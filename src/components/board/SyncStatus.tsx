import { useEffect, useState } from "react";

import type { SyncStatus as Status } from "../../lib/types";

import { relativeTime } from "../../lib/client/labels";

interface Props {
  status: Status;
  syncing: boolean;
  onSync(full: boolean): void;
}

export function SyncStatus({ status, syncing, onSync }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const busy = syncing || status.inFlight.length > 0;
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-600">
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
      {status.rateRemaining !== null && (
        <span className="text-neutral-400" title="GitHub API points left this hour">
          · {status.rateRemaining} left
        </span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => onSync(false)}
        className="rounded-md border border-neutral-300 bg-white px-2 py-0.5 hover:bg-neutral-50 disabled:opacity-50"
      >
        Refresh
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onSync(true)}
        title="Re-fetch every open issue"
        className="text-neutral-500 hover:underline disabled:opacity-50"
      >
        full resync
      </button>
    </div>
  );
}
