import type { SyncStatus as Status } from "../../lib/pacts/types";

import { relativeTime } from "../../lib/client/labels";
import { useNow } from "../../lib/client/useNow";

interface Props {
  status: Status;
  syncing: boolean;
  /** No repo is on, so Refresh has nothing to sync. */
  allOff: boolean;
  /** A failed sync request, or the error the sync it started finished with. */
  error: string | null;
  onSync(full: boolean): void;
  onDismissError(): void;
}

export function SyncStatus({ status, syncing, allOff, error, onSync, onDismissError }: Props) {
  const now = useNow();

  const busy = syncing || status.inFlight.length > 0;
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-600">
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
        <span role="alert" className="text-red-700">
          {error}{" "}
          <button type="button" onClick={onDismissError} className="font-medium hover:underline">
            dismiss
          </button>
        </span>
      )}
      {status.rateRemaining !== null && (
        <span
          className="text-xs text-neutral-500 tabular-nums"
          title="GitHub API points left this hour"
        >
          · {status.rateRemaining} left
        </span>
      )}
      <button
        type="button"
        disabled={busy || allOff}
        onClick={() => onSync(false)}
        title={allOff ? "No repos on" : "Sync the repos that are on"}
        className="btn btn-sm"
      >
        Refresh
      </button>
      <button
        type="button"
        disabled={busy || allOff}
        onClick={() => onSync(true)}
        title={allOff ? "No repos on" : "Re-fetch every open issue of the repos that are on"}
        className="text-xs text-neutral-500 hover:underline disabled:text-neutral-300"
      >
        full resync
      </button>
    </div>
  );
}
