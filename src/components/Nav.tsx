import { useEffect, useState } from "react";

import { api } from "../lib/client/api";
import { repoShortName } from "../lib/client/labels";
import { useHiddenRepos } from "../lib/client/useHiddenRepos";
import { Toggles } from "./board/Toggles";

interface Props {
  path: string;
  dashboards: { id: string; name: string }[];
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
 * The dashboards and the repo chips every board follows. A dashboard with no items in the repos
 * switched on is dimmed.
 */
export default function Nav({ path, dashboards, repos }: Props) {
  const [hidden, setHidden] = useHiddenRepos();
  const [present, setPresent] = useState<Map<string, string[]> | null>(null);

  useEffect(() => {
    api
      .dashboards()
      .then(({ dashboards: found }) => setPresent(new Map(found.map((d) => [d.id, d.repos]))))
      .catch(() => undefined);
  }, []);

  const shown = repos.filter((repo) => !hidden.includes(repo));
  const inactive = (id: string) =>
    present?.get(id)?.every((repo) => !shown.includes(repo)) ?? false;

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-neutral-200 bg-white px-4 py-2">
      <a href="/" className="mr-3 font-semibold tracking-tight">
        landschaft
      </a>
      {dashboards.map((dashboard) => (
        <a
          key={dashboard.id}
          href={`/d/${dashboard.id}`}
          title={inactive(dashboard.id) ? "No items in the repositories switched on" : undefined}
          className={link(path === `/d/${dashboard.id}`, inactive(dashboard.id))}
        >
          {dashboard.name}
        </a>
      ))}
      <div className="ml-auto flex flex-wrap items-center gap-3">
        {repos.length > 1 && (
          <Toggles
            label="Repositories"
            options={repos.map((repo) => ({ value: repo, label: repoShortName(repo) }))}
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
