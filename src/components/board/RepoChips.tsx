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
import { FOCUS, Icon, ROTATE } from "./icons";
import { SYNCING_DOT } from "./tone";

const RING = "ring-[1.5px] ring-inset";

/** A repo's phase, shown the same on or off and in a hue no health uses. */
const PHASE_DOT: Record<Exclude<SyncPhase, "idle">, string> = {
  syncing: SYNCING_DOT,
  queued: `${RING} ring-violet-500`,
};

/** A repo's health while it has no phase: filled when it is on, a ring when off. */
const HEALTH_DOT: Record<SyncHealth, { on: string; off: string }> = {
  failed: { on: "bg-red-500", off: `${RING} ring-red-500` },
  fresh: { on: "bg-emerald-500", off: `${RING} ring-emerald-500` },
  late: { on: "bg-amber-400", off: `${RING} ring-amber-400` },
  stale: { on: "bg-orange-600", off: `${RING} ring-orange-600` },
};

/**
 * A chip's edge button. Its space stays reserved while the row has room, so the chips do not shift
 * on hover; in a crowded row it gives way before the name does.
 */
const EDGE =
  "grid h-5 w-5 min-w-0 shrink-[999] place-items-center overflow-hidden rounded-full opacity-0 transition-opacity duration-150 group-has-[:focus-visible]:opacity-100 group-hover:opacity-100 hover:bg-white hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:text-neutral-300 disabled:hover:bg-transparent motion-reduce:transition-none";

/** A shrunk chip at its full width, laid over its neighbours, while hovered or focused by keyboard. */
const OPEN =
  "group-hover:z-10 group-hover:w-max group-hover:shrink-0 group-hover:shadow-md group-has-[:focus-visible]:z-10 group-has-[:focus-visible]:w-max group-has-[:focus-visible]:shrink-0 group-has-[:focus-visible]:shadow-md";

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
  const dot =
    view.phase === "idle" ? HEALTH_DOT[view.health][on ? "on" : "off"] : PHASE_DOT[view.phase];
  return (
    // The slot shrinks with the row; an open chip overflows it, inward at the row's ends.
    <div className="group flex h-5.5 min-w-0 justify-center first:justify-start nth-last-2:justify-end nth-last-3:justify-end">
      <div
        className={`relative flex h-full w-full min-w-0 items-center rounded-full border text-xs ${OPEN} ${
          on
            ? "border-neutral-300 bg-neutral-100 text-neutral-900"
            : "border-neutral-200 bg-white text-neutral-400"
        }`}
      >
        <button
          type="button"
          disabled={view.phase !== "idle"}
          aria-label={view.label}
          title={view.label}
          onClick={onSync}
          className={`${EDGE} ${view.health === "failed" ? "text-red-700" : "text-neutral-700"}`}
        >
          <Icon>{ROTATE}</Icon>
        </button>
        <button
          type="button"
          aria-pressed={on}
          aria-label={repo}
          title={on ? `Hide ${repo}` : `Show ${repo}`}
          onClick={onToggle}
          className="flex h-full min-w-0 items-center gap-1.5 rounded-full pl-1 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-sky-600"
        >
          <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${dot}`} />
          {/* The fade sits in the padding, so it reaches the name only when the name is clipped. */}
          <span className="overflow-hidden mask-r-from-[calc(100%-0.5rem)] pr-2 whitespace-nowrap">
            {repoShortName(repo)}
          </span>
        </button>
        <button
          type="button"
          aria-pressed={alone}
          aria-label={`Show only ${repo}`}
          title={alone ? "Show the repos from before" : `Show only ${repo}`}
          onClick={onOnly}
          className={`${EDGE} ${alone ? "bg-white text-sky-700" : "text-neutral-700"}`}
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
 * A chip per repo on one line, its dot showing the sync state; the chips shrink together when the
 * line is too narrow. The name switches it on or off; hover or keyboard focus opens a shrunk chip
 * and reveals the edges: sync it on the left, show it alone on the right (pressed again, the repos
 * from before come back). Ends with a switch that turns them all on, or all off once they are all
 * on.
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
    <div role="group" aria-label="Repositories" className="flex items-center gap-1">
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
        className="shrink-0 rounded-full px-2 text-xs font-medium text-neutral-500 hover:text-neutral-900"
      >
        {allOn ? "none" : "all"}
      </button>
    </div>
  );
}
