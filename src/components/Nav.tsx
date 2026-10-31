import { useCallback, useEffect, useRef, useState } from "react";

import type { NavData } from "../lib/pacts/types";

import { api, CONFIG_SAVED, errorMessage } from "../lib/client/api";
import { SYNCED, useSyncStatus } from "../lib/client/useSyncStatus";
import { RepoChips } from "./board/RepoChips";
import { SyncStatus } from "./board/SyncStatus";
import { ErrorBanner } from "./ErrorBanner";

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
  const [{ dashboards, repos, hidden }, setNav] = useState(nav);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const { status, error, syncing, sync, dismissError } = useSyncStatus();

  const seq = useRef(0);
  const saving = useRef(0);

  // A response is dropped once a newer reload has started, or while a toggle is still saving: it
  // would undo that toggle, and the last save to settle reloads.
  const reload = useCallback(() => {
    const mine = ++seq.current;
    api
      .nav()
      .then((next) => {
        if (mine === seq.current && saving.current === 0) setNav(next);
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

  const shown = repos.filter((repo) => !hidden.includes(repo));
  const setShown = (selected: string[]) => {
    const flipped = repos.filter((repo) => selected.includes(repo) === hidden.includes(repo));
    const off = flipped.filter((repo) => !selected.includes(repo));
    const on = flipped.filter((repo) => selected.includes(repo));
    setToggleError(null);
    // Applied now so a click before the reload diffs against what the user already chose.
    setNav((prev) => ({
      ...prev,
      hidden: [...prev.hidden.filter((repo) => !on.includes(repo)), ...off],
    }));
    // Saving fires CONFIG_SAVED, which reloads every view.
    saving.current += 1;
    void (async () => {
      try {
        if (off.length > 0) await api.setHidden({ repos: off, hidden: true });
        if (on.length > 0) await api.setHidden({ repos: on, hidden: false });
      } catch (cause) {
        setToggleError(`Switching repositories failed: ${errorMessage(cause)}`);
      } finally {
        saving.current -= 1;
        if (saving.current === 0) reload();
      }
    })();
  };
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
              onSync={(full) => void sync({ full })}
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
          <RepoChips
            repos={repos}
            shown={shown}
            status={status}
            onChange={setShown}
            onSync={(repo) => void sync({ repos: [repo] })}
          />
          {toggleError && (
            <ErrorBanner error={toggleError} onDismiss={() => setToggleError(null)} />
          )}
        </div>
      )}
    </nav>
  );
}
