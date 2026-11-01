import type { SyncStatus } from "../../lib/pacts/types";

import { relativeTime, repoShortName } from "../../lib/client/labels";
import { useNow } from "../../lib/client/useNow";

type SyncPhase = "idle" | "syncing" | "queued";

const SYNC_PHASE: Record<SyncPhase, { label(repo: string): string; icon: string }> = {
  idle: { label: (repo) => `Sync ${repo}`, icon: "" },
  syncing: { label: (repo) => `Syncing ${repo}`, icon: "motion-safe:animate-spin text-sky-600" },
  queued: { label: (repo) => `${repo} is queued`, icon: "motion-safe:animate-pulse" },
};

interface Props {
  repos: string[];
  shown: string[];
  status: SyncStatus | null;
  onChange(shown: string[]): void;
  onSync(repo: string): void;
}

/**
 * A chip per repo: switches it on or off, shows its sync age, syncs it, and shows it alone unless
 * it already is. Ends with a switch that turns them all on, or all off once they are all on.
 */
export function RepoChips({ repos, shown, status, onChange, onSync }: Props) {
  const now = useNow();
  const allOn = repos.every((repo) => shown.includes(repo));
  const sorted = repos.toSorted((a, b) => repoShortName(a).localeCompare(repoShortName(b)));

  return (
    <div role="group" aria-label="Repositories" className="flex flex-wrap items-center gap-1.5">
      {sorted.map((repo) => {
        const on = shown.includes(repo);
        const alone = on && shown.length === 1;
        const sync = status?.repos[repo];
        const phase: SyncPhase = status?.inFlight.includes(repo)
          ? "syncing"
          : status?.queued.includes(repo)
            ? "queued"
            : "idle";
        const syncLabel = SYNC_PHASE[phase].label(repo);
        return (
          <div
            key={repo}
            className={`flex items-center rounded-full border text-sm leading-7 transition-colors ${
              on
                ? "border-neutral-400 bg-neutral-100 text-neutral-900"
                : "border-dashed border-neutral-300 bg-white text-neutral-500"
            }`}
          >
            <button
              type="button"
              aria-pressed={on}
              title={repo}
              onClick={() => onChange(on ? shown.filter((r) => r !== repo) : [...shown, repo])}
              className="flex items-center gap-1.5 rounded-l-full pr-1.5 pl-3 hover:text-neutral-950"
            >
              <span className={on ? undefined : "line-through"}>{repoShortName(repo)}</span>
              <span
                title={sync?.lastError ?? undefined}
                className={`text-xs tabular-nums ${sync?.lastError ? "text-red-700" : "text-neutral-500"}`}
              >
                {relativeTime(sync?.lastSyncAt ?? null, now)}
              </span>
            </button>
            <button
              type="button"
              disabled={phase !== "idle"}
              aria-label={syncLabel}
              title={syncLabel}
              onClick={() => onSync(repo)}
              className={`pl-1.5 text-neutral-500 hover:text-neutral-900 disabled:text-neutral-300 ${
                alone ? "rounded-r-full pr-3" : "pr-1.5"
              }`}
            >
              <span className={`inline-block ${SYNC_PHASE[phase].icon}`}>↻</span>
            </button>
            {!alone && (
              <button
                type="button"
                aria-label={`Show only ${repo}`}
                title={`Show only ${repo}`}
                onClick={() => onChange([repo])}
                className="rounded-r-full pr-3 pl-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900"
              >
                only
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange(allOn ? [] : repos)}
        className="rounded-full px-2 text-xs font-medium text-neutral-500 hover:text-neutral-900"
      >
        {allOn ? "none" : "all"}
      </button>
    </div>
  );
}
