import type { SyncStatus } from "../../lib/pacts/types";

import { relativeTime, repoShortName } from "../../lib/client/labels";
import { useNow } from "../../lib/client/useNow";

interface Props {
  repos: string[];
  shown: string[];
  status: SyncStatus | null;
  onChange(shown: string[]): void;
  onSync(repo: string): void;
}

/**
 * A chip per repo: switches it on or off, shows its sync age, syncs it, and shows it alone, or
 * every repo again when it already is alone. Ends with a switch that turns them all on, or all
 * off once they are all on.
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
        const busy = Boolean(status?.inFlight.includes(repo));
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
              disabled={busy}
              aria-label={`Sync ${repo}`}
              title={`Sync ${repo}`}
              onClick={() => onSync(repo)}
              className={`px-1.5 text-neutral-500 hover:text-neutral-900 disabled:text-neutral-300 ${
                busy ? "animate-pulse" : ""
              }`}
            >
              ↻
            </button>
            <button
              type="button"
              aria-label={alone ? "Show every repository" : `Show only ${repo}`}
              title={alone ? "Show every repository" : `Show only ${repo}`}
              onClick={() => onChange(alone ? repos : [repo])}
              className="rounded-r-full pr-3 pl-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900"
            >
              {alone ? "all" : "only"}
            </button>
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
