import { useCallback, useEffect, useRef, useState } from "react";

import type { NavData } from "../lib/pacts/views";

import { api, CONFIG_SAVED, saveHidden } from "../lib/client/api";
import { SYNCED, useSyncStatus } from "../lib/client/useSyncStatus";
import { RepoChips } from "./board/RepoChips";
import { SyncStatus } from "./board/SyncStatus";
import { ErrorBanner } from "./ErrorBanner";

interface Props {
  path: string;
  /** As rendered on the server; refetched when the config is saved or a sync lands. */
  nav: NavData;
  /** The repos this browser switched off, from its cookie; the top bar keeps the list from here. */
  hidden: string[];
}

const link = (inactive = false) =>
  `nav-item px-2.5 py-1 ${inactive ? "text-neutral-400" : "text-neutral-600"} hover:bg-neutral-100 hover:text-neutral-900`;

const current = (active: boolean) => (active ? "page" : undefined);

/**
 * The dashboards, the repo chips every board follows, and the sync status with its buttons. A
 * dashboard with no items in the repos switched on is dimmed.
 */
export default function Nav({ path, nav, hidden: initialHidden }: Props) {
  const [{ dashboards, repos, refreshMinutes }, setNav] = useState(nav);
  const [hidden, setHidden] = useState(initialHidden);
  const { status, error, syncing, sync, dismissError } = useSyncStatus();

  const seq = useRef(0);

  // A response is dropped once a newer reload has started.
  const reload = useCallback(() => {
    const mine = ++seq.current;
    api
      .nav()
      .then((next) => {
        if (mine === seq.current) setNav(next);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    window.addEventListener(CONFIG_SAVED, reload);
    window.addEventListener(SYNCED, reload);
    return () => {
      window.removeEventListener(CONFIG_SAVED, reload);
      window.removeEventListener(SYNCED, reload);
    };
  }, [reload]);

  // A user sync on purpose: a page load's failures show in the top bar, as a Refresh's do.
  useEffect(() => {
    void sync({ stale: true });
  }, [sync]);

  const shown = repos.filter((repo) => !hidden.includes(repo));
  const setShown = (selected: string[]) => {
    const off = repos.filter((repo) => !selected.includes(repo));
    setHidden(off);
    saveHidden(off);
  };
  const active = dashboards.find((dashboard) => path === `/d/${dashboard.id}`);
  const inactive = (dashboard: NavData["dashboards"][number]) =>
    dashboard.repos.every((repo) => !shown.includes(repo));

  return (
    <nav className="border-b border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center gap-1 px-4 py-2">
        <a href="/" className="mr-4 text-[1.0625rem] font-semibold tracking-tight">
          landschaft
        </a>
        {dashboards.map((dashboard) => (
          <a
            key={dashboard.id}
            href={`/d/${dashboard.id}`}
            title={inactive(dashboard) ? "No items in the repositories switched on" : undefined}
            aria-current={current(dashboard === active)}
            className={link(inactive(dashboard))}
          >
            {dashboard.name}
          </a>
        ))}
        {dashboards.length > 0 && (
          <a
            href="/unmatched"
            title="Open items no dashboard places"
            aria-current={current(path === "/unmatched")}
            className={link()}
          >
            Unmatched
          </a>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {status ? (
            <SyncStatus
              status={status}
              repos={repos}
              syncing={syncing}
              error={error}
              onSync={(full) => void sync({ full })}
              onDismissError={dismissError}
            />
          ) : (
            error && <ErrorBanner error={error} onDismiss={dismissError} />
          )}
          <a
            href={`/settings${active ? `#${active.id}` : ""}`}
            aria-current={current(path === "/settings")}
            className={link()}
          >
            Settings
          </a>
        </div>
      </div>
      {(repos.length > 1 || shown.length < repos.length) && (
        <div className="border-t border-neutral-100 px-4 py-2">
          <RepoChips
            repos={repos}
            shown={shown}
            status={status}
            refreshMinutes={refreshMinutes}
            onChange={setShown}
            onSync={(repo) => void sync({ repos: [repo] })}
          />
        </div>
      )}
    </nav>
  );
}
