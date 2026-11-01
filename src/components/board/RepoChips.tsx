import { type ReactNode, useState } from "react";

import type { SyncStatus } from "../../lib/pacts/types";

import { relativeTime, repoShortName, type SyncAge, syncAge } from "../../lib/client/labels";
import { useNow } from "../../lib/client/useNow";

type SyncPhase = "idle" | "syncing" | "queued";

const SYNC_LABEL: Record<SyncPhase, (repo: string) => string> = {
  idle: (repo) => `Sync ${repo}`,
  syncing: (repo) => `Syncing ${repo}`,
  queued: (repo) => `${repo} is queued`,
};

const AGE_DOT: Record<SyncAge, { fill: string; ring: string }> = {
  fresh: { fill: "bg-emerald-500", ring: "ring-emerald-500" },
  late: { fill: "bg-amber-400", ring: "ring-amber-400" },
  stale: { fill: "bg-orange-600", ring: "ring-orange-600" },
};

/** Filled when the repo is on, a ring when off; the colour says how fresh its sync is. */
function dotClass(phase: SyncPhase, age: SyncAge, on: boolean, failed: boolean): string {
  if (phase === "syncing") return "bg-sky-500 motion-safe:animate-pulse";
  if (phase === "queued") return "ring-[1.5px] ring-sky-500 ring-inset";
  if (failed) return on ? "bg-red-500" : "ring-[1.5px] ring-red-500 ring-inset";
  return on ? AGE_DOT[age].fill : `ring-[1.5px] ring-inset ${AGE_DOT[age].ring}`;
}

/** Lucide icon paths (ISC), inlined: three icons do not earn a dependency. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
    >
      {children}
    </svg>
  );
}

const EYE = (
  <>
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </>
);
const EYE_OFF = (
  <>
    <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
    <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
    <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
    <path d="m2 2 20 20" />
  </>
);
const ROTATE = (
  <>
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
  </>
);
const FOCUS = (
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
  </>
);

const ACTION =
  "grid size-5 place-items-center rounded-full hover:bg-white hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:text-neutral-300 disabled:hover:bg-transparent";

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

  return (
    <div role="group" aria-label="Repositories" className="flex flex-wrap items-center gap-1">
      {sorted.map((repo) => {
        const on = shown.includes(repo);
        const alone = on && shown.length === 1;
        const sync = status?.repos[repo];
        const failed = Boolean(sync?.lastError);
        const age = syncAge(sync?.lastSyncAt ?? null, refreshMinutes, now);
        const phase: SyncPhase = status?.inFlight.includes(repo)
          ? "syncing"
          : status?.queued.includes(repo)
            ? "queued"
            : "idle";
        const synced = failed
          ? `last sync failed: ${sync?.lastError}`
          : `synced ${relativeTime(sync?.lastSyncAt ?? null, now)}`;
        const syncLabel = `${SYNC_LABEL[phase](repo)} (${synced})`;
        return (
          <div
            key={repo}
            className={`group relative flex h-5.5 min-w-19 items-center justify-center rounded-full border px-2 text-xs ${
              on
                ? "border-neutral-300 bg-neutral-100 text-neutral-900"
                : "border-neutral-200 bg-white text-neutral-400"
            }`}
          >
            <span className="flex items-center gap-1.5 transition duration-150 group-focus-within:opacity-30 group-focus-within:blur-[1.5px] group-hover:opacity-30 group-hover:blur-[1.5px] motion-reduce:transition-none">
              <span
                aria-hidden
                className={`size-1.5 shrink-0 rounded-full ${dotClass(phase, age, on, failed)}`}
              />
              {repoShortName(repo)}
            </span>
            <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none">
              <button
                type="button"
                aria-pressed={on}
                aria-label={repo}
                title={on ? `Hide ${repo}` : `Show ${repo}`}
                onClick={() => onChange(on ? shown.filter((r) => r !== repo) : [...shown, repo])}
                className={`${ACTION} text-neutral-700`}
              >
                <Icon>{on ? EYE_OFF : EYE}</Icon>
              </button>
              <button
                type="button"
                disabled={phase !== "idle"}
                aria-label={syncLabel}
                title={syncLabel}
                onClick={() => onSync(repo)}
                className={`${ACTION} ${failed ? "text-red-700" : "text-neutral-700"}`}
              >
                <Icon>{ROTATE}</Icon>
              </button>
              <button
                type="button"
                aria-pressed={alone}
                aria-label={`Show only ${repo}`}
                title={alone ? "Show the repos from before" : `Show only ${repo}`}
                onClick={() => {
                  if (alone) return onChange(beforeOnly.length > 1 ? beforeOnly : repos);
                  setBeforeOnly(shown);
                  onChange([repo]);
                }}
                className={`${ACTION} ${alone ? "bg-white text-sky-700" : "text-neutral-700"}`}
              >
                <Icon>{FOCUS}</Icon>
              </button>
            </div>
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
