import type { ReactNode } from "react";

import type { ViewRequest } from "../../lib/client/useViewRequest";
import type { Dashboard } from "../../lib/schema";
import type { Epic, Facets } from "../../lib/types";

import { ErrorBanner } from "../ErrorBanner";
import { FilterBar } from "./FilterBar";

interface Props {
  view: ViewRequest;
  dashboard: Pick<Dashboard, "name" | "filter">;
  facets: Facets;
  /** After the name, e.g. "12 issues". */
  count: string;
  /** Where the items are, for the notice that all their repos are off, e.g. "on this board". */
  where: string;
  error: string | null;
  onDismissError(): void;
  epics?: Epic[];
  /** Between the notices and the filter bar. */
  above?: ReactNode;
  className: string;
  children: ReactNode;
}

/** A dashboard view's header, error banner, switched-off notice and filter bar over its body. */
export function ViewShell({
  view,
  dashboard,
  facets,
  count,
  where,
  error,
  onDismissError,
  epics,
  above,
  className,
  children,
}: Props) {
  const { filters, updateFilters, hidden } = view;
  return (
    <div className={`flex flex-col gap-3 p-4 ${className}`}>
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-lg font-semibold">
          {dashboard.name}
          <span className="ml-2 text-sm font-normal text-neutral-500">
            {count}
            {dashboard.filter && (
              <code title="Dashboard filter" className="ml-2 text-xs">
                {dashboard.filter}
              </code>
            )}
          </span>
        </h1>
      </header>

      {error && <ErrorBanner error={error} onDismiss={onDismissError} />}
      {facets.repos.length > 0 && facets.repos.every((repo) => hidden.includes(repo)) && (
        <p className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-600">
          Every repository with items {where} is switched off in the bar above.
        </p>
      )}
      {above}
      <FilterBar filters={filters} facets={facets} epics={epics} onChange={updateFilters} />

      {children}
    </div>
  );
}
