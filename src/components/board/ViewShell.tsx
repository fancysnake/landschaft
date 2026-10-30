import type { ReactNode } from "react";

import type { ViewRequest } from "../../lib/client/useViewRequest";
import type { Dashboard } from "../../lib/pacts/schema";
import type { Epic, Facets } from "../../lib/pacts/types";

import { ErrorBanner } from "../ErrorBanner";
import { FilterBar } from "./FilterBar";

interface Props {
  view: ViewRequest;
  dashboard: Pick<Dashboard, "name" | "filter" | "type">;
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
  const { filters, updateFilters } = view;
  return (
    <div className={`flex flex-col gap-4 p-5 ${className}`}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="flex items-baseline">
          <nav aria-label="Breadcrumb" className="text-2xl tracking-tight">
            <a href="/" className="text-neutral-500 hover:text-neutral-700">
              Dashboards
            </a>
            <span aria-hidden="true" className="mx-1.5 text-neutral-300">
              /
            </span>
          </nav>
          <h1 className="page-title">{dashboard.name}</h1>
        </div>
        <span className="pill text-neutral-500 ring-neutral-300">{dashboard.type}</span>
        <span className="text-sm text-neutral-500 tabular-nums">{count}</span>
        {dashboard.filter && (
          <code
            title="Dashboard filter"
            className="rounded bg-neutral-200/70 px-1.5 py-0.5 font-mono text-xs text-neutral-600"
          >
            {dashboard.filter}
          </code>
        )}
      </header>

      {error && <ErrorBanner error={error} onDismiss={onDismissError} />}
      {facets.repos.length > 0 && facets.hidden.length === facets.repos.length && (
        <p className="panel px-3 py-2 text-sm text-neutral-600 shadow-none">
          Every repository with items {where} is switched off in the bar above.
        </p>
      )}
      {above}
      <FilterBar filters={filters} facets={facets} epics={epics} onChange={updateFilters} />

      {children}
    </div>
  );
}
