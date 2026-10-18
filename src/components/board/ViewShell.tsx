import type { ReactNode } from "react";

import type { ViewRequest } from "../../lib/client/useViewRequest";
import type { Dashboard } from "../../lib/schema";
import type { Epic, Facets } from "../../lib/types";

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
  const { filters, updateFilters, hidden } = view;
  return (
    <div className={`flex flex-col gap-4 p-5 ${className}`}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          <a href="/" className="font-normal text-neutral-400 hover:text-neutral-700">
            Dashboards
          </a>
          <span className="mx-1.5 font-normal text-neutral-300">/</span>
          {dashboard.name}
        </h1>
        <span className="rounded border border-neutral-300 px-1.5 text-[11px] font-medium tracking-wider text-neutral-500 uppercase">
          {dashboard.type}
        </span>
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
      {facets.repos.length > 0 && facets.repos.every((repo) => hidden.includes(repo)) && (
        <p className="panel px-3 py-2 text-sm text-neutral-600">
          Every repository with items {where} is switched off in the bar above.
        </p>
      )}
      {above}
      <FilterBar filters={filters} facets={facets} epics={epics} onChange={updateFilters} />

      {children}
    </div>
  );
}
