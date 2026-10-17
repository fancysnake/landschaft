import { repoShortName } from "../lib/client/labels";
import { useHiddenRepos } from "../lib/client/useHiddenRepos";
import { useSyncStatus } from "../lib/client/useSyncStatus";
import { SyncStatus } from "./board/SyncStatus";
import { Toggles } from "./board/Toggles";

interface Props {
  path: string;
  /** Each with the repos among its items. */
  dashboards: { id: string; name: string; repos: string[] }[];
  /** The global repos. */
  repos: string[];
}

const link = (active: boolean, inactive = false) =>
  `rounded-md px-2 py-1 text-sm ${
    active
      ? "bg-neutral-800 text-white"
      : `${inactive ? "text-neutral-400" : "text-neutral-700"} hover:bg-neutral-200`
  }`;

/**
 * The dashboards, the repo chips every board follows, and the sync status with its buttons. A
 * dashboard with no items in the repos switched on is dimmed.
 */
export default function Nav({ path, dashboards, repos }: Props) {
  const [hidden, setHidden] = useHiddenRepos();
  const { status, error, syncing, sync, dismissError } = useSyncStatus();
  const shown = repos.filter((repo) => !hidden.includes(repo));
  const inactive = (dashboard: Props["dashboards"][number]) =>
    dashboard.repos.every((repo) => !shown.includes(repo));

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-neutral-200 bg-white px-4 py-2">
      <a href="/" className="mr-3 font-semibold tracking-tight">
        landschaft
      </a>
      {dashboards.map((dashboard) => (
        <a
          key={dashboard.id}
          href={`/d/${dashboard.id}`}
          title={inactive(dashboard) ? "No items in the repositories switched on" : undefined}
          className={link(path === `/d/${dashboard.id}`, inactive(dashboard))}
        >
          {dashboard.name}
        </a>
      ))}
      {dashboards.length > 0 && (
        <a
          href="/unmatched"
          title="Open items no dashboard places"
          className={link(path === "/unmatched")}
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
        {repos.length > 1 && (
          <Toggles
            label="Repositories"
            options={repos
              .map((repo) => ({ value: repo, label: repoShortName(repo) }))
              .toSorted((a, b) => a.label.localeCompare(b.label))}
            selected={shown}
            onChange={(selected) => setHidden(repos.filter((repo) => !selected.includes(repo)))}
          />
        )}
        <a href="/settings" className={link(path === "/settings")}>
          Settings
        </a>
      </div>
    </nav>
  );
}
