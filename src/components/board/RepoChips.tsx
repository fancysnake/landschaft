import { useState } from "react";

import type { SyncStatus } from "../../lib/pacts/sync";

import { repoShortName } from "../../lib/client/labels";
import {
  type RepoSyncView,
  repoSyncView,
  type SyncHealth,
  type SyncPhase,
} from "../../lib/client/syncView";
import { useNow } from "../../lib/client/useNow";
import { EYE, EYE_OFF, FOCUS, Icon, ROTATE } from "./icons";

/** What a dot shows: the phase while the repo has one, else the health. */
type DotKey = Exclude<SyncPhase, "idle"> | SyncHealth;

const RING = "ring-[1.5px] ring-inset";

/** Filled when the repo is on, a ring when off; always filled syncing, always a ring queued. */
const DOT: Record<DotKey, { on: string; off: string }> = {
  syncing: {
    on: "bg-sky-500 motion-safe:animate-pulse",
    off: "bg-sky-500 motion-safe:animate-pulse",
  },
  queued: { on: `${RING} ring-sky-500`, off: `${RING} ring-sky-500` },
  failed: { on: "bg-red-500", off: `${RING} ring-red-500` },
  fresh: { on: "bg-emerald-500", off: `${RING} ring-emerald-500` },
  late: { on: "bg-amber-400", off: `${RING} ring-amber-400` },
  stale: { on: "bg-orange-600", off: `${RING} ring-orange-600` },
};

const ACTION =
  "grid size-5 place-items-center rounded-full hover:bg-white hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:text-neutral-300 disabled:hover:bg-transparent";

interface ChipProps {
  repo: string;
  on: boolean;
  alone: boolean;
  view: RepoSyncView;
  onToggle(): void;
  onSync(): void;
  onOnly(): void;
}

function RepoChip({ repo, on, alone, view, onToggle, onSync, onOnly }: ChipProps) {
  const dot = DOT[view.phase === "idle" ? view.health : view.phase];
  return (
    <div
      className={`group relative flex h-5.5 min-w-19 items-center justify-center rounded-full border px-2 text-xs ${
        on
          ? "border-neutral-300 bg-neutral-100 text-neutral-900"
          : "border-neutral-200 bg-white text-neutral-400"
      }`}
    >
      <span className="flex items-center gap-1.5 transition duration-150 group-focus-within:opacity-30 group-focus-within:blur-[1.5px] group-hover:opacity-30 group-hover:blur-[1.5px] motion-reduce:transition-none">
        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${on ? dot.on : dot.off}`} />
        {repoShortName(repo)}
      </span>
      <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none">
        <button
          type="button"
          aria-pressed={on}
          aria-label={repo}
          title={on ? `Hide ${repo}` : `Show ${repo}`}
          onClick={onToggle}
          className={`${ACTION} text-neutral-700`}
        >
          <Icon>{on ? EYE_OFF : EYE}</Icon>
        </button>
        <button
          type="button"
          disabled={view.phase !== "idle"}
          aria-label={view.label}
          title={view.label}
          onClick={onSync}
          className={`${ACTION} ${view.health === "failed" ? "text-red-700" : "text-neutral-700"}`}
        >
          <Icon>{ROTATE}</Icon>
        </button>
        <button
          type="button"
          aria-pressed={alone}
          aria-label={`Show only ${repo}`}
          title={alone ? "Show the repos from before" : `Show only ${repo}`}
          onClick={onOnly}
          className={`${ACTION} ${alone ? "bg-white text-sky-700" : "text-neutral-700"}`}
        >
          <Icon>{FOCUS}</Icon>
        </button>
      </div>
    </div>
  );
}

interface Props {
  repos: string[];
  shown: string[];
  status: SyncStatus | null;
  refreshMinutes: number;
  onChange(shown: string[]): void;
  onSync(repo: string): void;
}

/**
 * A chip per repo, its dot showing the sync state. Hover or focus blurs the name under three
 * actions: switch it on or off, sync it, show it alone (pressed again, the repos from before come
 * back). Ends with a switch that turns them all on, or all off once they are all on.
 */
export function RepoChips({ repos, shown, status, refreshMinutes, onChange, onSync }: Props) {
  const now = useNow();
  const [beforeOnly, setBeforeOnly] = useState<string[]>([]);
  const allOn = repos.every((repo) => shown.includes(repo));
  const sorted = repos.toSorted((a, b) => repoShortName(a).localeCompare(repoShortName(b)));
  const isAlone = (repo: string) => shown.length === 1 && shown[0] === repo;

  function toggleOnly(repo: string) {
    if (isAlone(repo)) {
      setBeforeOnly([]);
      return onChange(beforeOnly.length > 0 ? beforeOnly : repos);
    }
    setBeforeOnly(shown);
    onChange([repo]);
  }

  return (
    <div role="group" aria-label="Repositories" className="flex flex-wrap items-center gap-1">
      {sorted.map((repo) => {
        const on = shown.includes(repo);
        return (
          <RepoChip
            key={repo}
            repo={repo}
            on={on}
            alone={isAlone(repo)}
            view={repoSyncView(repo, status, refreshMinutes, now)}
            onToggle={() => onChange(on ? shown.filter((r) => r !== repo) : [...shown, repo])}
            onSync={() => onSync(repo)}
            onOnly={() => toggleOnly(repo)}
          />
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
