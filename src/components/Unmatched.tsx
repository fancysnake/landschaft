import { useCallback } from "react";

import { api } from "../lib/client/api";
import { labelStyle, repoShortName } from "../lib/client/labels";
import { useHiddenRepos } from "../lib/client/useHiddenRepos";
import { useSynced } from "../lib/client/useSynced";

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
      {error && (
        <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="font-medium hover:underline"
          >
            dismiss
          </button>
        </div>
      )}
      {data.items.length === 0 ? (
        <p className="text-sm text-neutral-600">
          Every open item in the repositories switched on is on a dashboard.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
          {data.items.map((item) => (
            <li
              key={`${item.repo}#${item.number}`}
              className="flex flex-col gap-1 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                <span className="font-mono">
                  {repoShortName(item.repo)}#{item.number}
                </span>
                {item.kind === "pr" && (
                  <span className="rounded bg-sky-100 px-1 text-sky-800">PR</span>
                )}
              </div>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-neutral-900 hover:underline"
              >
                {item.title}
              </a>
              {item.labels.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.labels.map((label) => (
                    <span
                      key={label.name}
                      style={labelStyle(label.color)}
                      className="rounded-full px-1.5 text-[11px] leading-4"
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
