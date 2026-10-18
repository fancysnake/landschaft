import { useCallback } from "react";

import { api } from "../lib/client/api";
import { useHiddenRepos } from "../lib/client/useHiddenRepos";
import { useSynced } from "../lib/client/useSynced";
import { CardView } from "./board/IssueCard";
import { ErrorBanner } from "./ErrorBanner";

/** Open items in the repos switched on that no dashboard places in a cell. */
export default function Unmatched() {
  const [hidden] = useHiddenRepos();
  const get = useCallback(() => api.unmatched(hidden), [hidden]);
  const { data, error, setError } = useSynced(get);

  if (!data) {
    return <p className="p-6 text-sm text-neutral-500">{error ?? "Loading…"}</p>;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 p-6">
      <h1 className="text-lg font-semibold">
        Unmatched
        <span className="ml-2 text-sm font-normal text-neutral-500">
          {data.items.length} items on no dashboard
        </span>
      </h1>
      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}
      {data.items.length === 0 ? (
        <p className="text-sm text-neutral-600">
          Every open item in the repositories switched on is on a dashboard.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((card) => (
            <li key={card.key}>
              <CardView card={card} showRepo />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
