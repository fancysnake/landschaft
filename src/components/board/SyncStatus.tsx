import type { SyncStatus as Status } from "../../lib/pacts/sync";

import { relativeTime } from "../../lib/client/labels";
import { syncErrors } from "../../lib/client/syncView";
import { useNow } from "../../lib/client/useNow";

interface Props {
  status: Status;
  /** The configured repos, whose failures the dot reports. */
  repos: string[];
  syncing: boolean;
  /** No repo is on, so Refresh has nothing to sync. */
  allOff: boolean;
  /** A failed sync request, or the error the sync it started finished with. */
  error: string | null;
  onSync(full: boolean): void;
  onDismissError(): void;
}

export function SyncStatus({
  status,
  repos,
  syncing,
  allOff,
  error,
  onSync,
  onDismissError,
}: Props) {
  const now = useNow();
  const errors = syncErrors(status, repos);

  const busy = syncing || status.inFlight.length > 0;
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-600">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          busy
            ? "bg-yellow-400 motion-safe:animate-pulse"
            : errors.length > 0
              ? "bg-red-500"
              : "bg-emerald-500"
        }`}
      />
      <span title={errors.join("\n") || undefined}>
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
