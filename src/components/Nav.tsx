import { useEffect, useState } from "react";

import type { NavData } from "../lib/types";

import { api, CONFIG_SAVED } from "../lib/client/api";
import { repoShortName } from "../lib/client/labels";
import { useHiddenRepos } from "../lib/client/useHiddenRepos";
import { SYNCED, useSyncStatus } from "../lib/client/useSyncStatus";
import { SyncStatus } from "./board/SyncStatus";
import { Toggles } from "./board/Toggles";

interface Props {
  path: string;
  /** As rendered on the server; refetched when the config is saved or a sync lands. */
  nav: NavData;
}

const link = (inactive = false) =>
  `nav-item px-2.5 py-1 ${inactive ? "text-neutral-400" : "text-neutral-600"} hover:bg-neutral-100 hover:text-neutral-900`;

const current = (active: boolean) => (active ? "page" : undefined);

/**
 * The dashboards, the repo chips every board follows, and the sync status with its buttons. A
 * dashboard with no items in the repos switched on is dimmed.
 */
export default function Nav({ path, nav }: Props) {
  const [{ dashboards, repos }, setNav] = useState(nav);
  const [hidden, setHidden] = useHiddenRepos();
  const { status, error, syncing, sync, dismissError } = useSyncStatus();

  useEffect(() => {
    // A response is dropped once a newer reload has started.
    let seq = 0;
    const reload = () => {
      const mine = ++seq;
      api
        .nav()
        .then((next) => {
          if (mine === seq) setNav(next);
        })
        .catch(() => undefined);
    };
    window.addEventListener(CONFIG_SAVED, reload);
    window.addEventListener(SYNCED, reload);
    return () => {
      window.removeEventListener(CONFIG_SAVED, reload);
      window.removeEventListener(SYNCED, reload);
    };
  }, []);

  const shown = repos.filter((repo) => !hidden.includes(repo));
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
            aria-current={current(path === `/d/${dashboard.id}`)}
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
          {status && (
            <SyncStatus
              status={status}
              syncing={syncing}
              error={error}
              onSync={(full) => void sync(full)}
              onDismissError={dismissError}
            />
          )}
          <a href="/settings" aria-current={current(path === "/settings")} className={link()}>
            Settings
          </a>
        </div>
      </div>
      {repos.length > 1 && (
        <div className="border-t border-neutral-100 px-4 py-2">
          <Toggles
            label="Repositories"
            options={repos
              .map((repo) => ({ value: repo, label: repoShortName(repo) }))
              .toSorted((a, b) => a.label.localeCompare(b.label))}
            selected={shown}
            onChange={(selected) => setHidden(repos.filter((repo) => !selected.includes(repo)))}
          />
        </div>
      )}
    </nav>
  );
}
