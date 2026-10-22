import { useCallback } from "react";

import type { ItemKind } from "../lib/types";

import { api } from "../lib/client/api";
import { useDebouncedText } from "../lib/client/useDebouncedText";
import { useHiddenRepos } from "../lib/client/useHiddenRepos";
import { useSynced } from "../lib/client/useSynced";
import { filterError } from "../lib/filter";
import { CardView } from "./board/IssueCard";
import { ErrorBanner } from "./ErrorBanner";
import { FilterInput } from "./settings/FilterInput";

const COLUMNS: { kind: ItemKind; title: string }[] = [
  { kind: "issue", title: "Issues" },
  { kind: "pr", title: "Pull requests" },
  { kind: "ci-job", title: "CI jobs" },
];

const parses = (text: string) => filterError(text) === null;

function writeUrl(filter: string) {
  const query = filter ? `?${new URLSearchParams({ filter })}` : "";
  window.history.replaceState(null, "", query || window.location.pathname);
}

/** Open items in the repos switched on that no dashboard places in a cell or inbox group. */
export default function Unmatched() {
  const [hidden] = useHiddenRepos();
  // Only a filter that parses reaches the server.
  const {
    text,
    setText,
    committed: filter,
  } = useDebouncedText(new URLSearchParams(window.location.search).get("filter") ?? "", {
    valid: parses,
    onCommit: writeUrl,
  });

  const get = useCallback(() => api.unmatched(hidden, filter), [hidden, filter]);
  const { data, error, setError } = useSynced(get);

  if (!data) {
    return <p className="p-6 text-sm text-neutral-500">{error ?? "Loading…"}</p>;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-5">
      <h1 className="page-title">
        Unmatched
        <span className="ml-3 text-sm font-normal tracking-normal text-neutral-500 tabular-nums">
          {data.items.length} items on no dashboard
        </span>
      </h1>
      <FilterInput
        value={text}
        onChange={setText}
        offer={data.offer}
        validate={filterError}
        placeholder="Filter, e.g. is:pr label:bug -repo:acme/docs"
      />
      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}
      {data.items.length === 0 ? (
        <p className="text-sm text-neutral-600">
          {filter
            ? "No unmatched item passes the filter."
            : "Every open item in the repositories switched on is on a dashboard."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNS.map(({ kind, title }) => {
            const cards = data.items.filter((card) => card.kind === kind);
            return (
              <section key={kind} className="flex flex-col gap-2">
                <h2 className="eyebrow">
                  {title}
                  <span className="ml-1.5 font-normal text-neutral-500 tabular-nums">
                    {cards.length}
                  </span>
                </h2>
                <ul className="flex flex-col gap-2">
                  {cards.map((card) => (
                    <li key={card.key}>
                      <CardView card={card} showRepo />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
