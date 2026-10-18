import type { Offer } from "../filter";
import type {
  BoardDashboard,
  ViewQuery,
  Config,
  Filters,
  InboxDashboard,
  StarEpicRequest,
  SyncRequest,
} from "../schema";
import type { Board, Card, Inbox, LabelDef, SyncStatus } from "../types";

export interface BoardResponse {
  dashboard: BoardDashboard;
  board: Board;
  status: SyncStatus;
}

export interface InboxResponse {
  dashboard: InboxDashboard;
  inbox: Inbox;
  status: SyncStatus;
}

export interface UnmatchedResponse {
  items: Card[];
  /** Filter completions from every unmatched item, filtered out or not. */
  offer: Offer;
  status: SyncStatus;
}

export interface SyncResponse {
  /** Absent on a sync-all, which answers `202` before any repo finishes. */
  results?: { repo: string; full: boolean; upserted: number; closed: number }[];
  status: SyncStatus;
}

interface ErrorPayload {
  error: string;
  issues?: { path: (string | number)[]; message: string }[];
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function describe(payload: ErrorPayload): string {
  if (!payload.issues?.length) return payload.error;
  return payload.issues
    .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
    .join("; ");
}

async function request<T>(input: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? describe(payload as ErrorPayload)
        : `HTTP ${response.status}`;
    throw new ApiClientError(message, response.status);
  }
  return payload as T;
}

export function filtersToQuery(filters: Filters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params.toString();
}

function viewUrl(dashboardId: string, view: "board" | "inbox", { hide, ...filters }: ViewQuery) {
  const params = new URLSearchParams(filtersToQuery(filters));
  if (hide?.length) params.set("hide", hide.join(","));
  return `/api/dashboards/${encodeURIComponent(dashboardId)}/${view}?${params}`;
}

export const api = {
  board: (dashboardId: string, query: ViewQuery) =>
    request<BoardResponse>(viewUrl(dashboardId, "board", query)),
  inbox: (dashboardId: string, query: ViewQuery) =>
    request<InboxResponse>(viewUrl(dashboardId, "inbox", query)),
  unmatched: (hide: string[], filter: string) =>
    request<UnmatchedResponse>(
      `/api/unmatched?${new URLSearchParams({ hide: hide.join(","), filter })}`,
    ),
  version: () => request<SyncStatus>("/api/version"),
  sync: (body: Partial<SyncRequest>) =>
    request<SyncResponse>("/api/sync", { method: "POST", body: JSON.stringify(body) }),
  setEpicStarred: (dashboardId: string, body: StarEpicRequest) =>
    request<{ starredEpics: string[] }>(
      `/api/dashboards/${encodeURIComponent(dashboardId)}/starred-epics`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  config: () => request<Config>("/api/config"),
  saveConfig: (config: unknown) =>
    request<Config>("/api/config", { method: "PUT", body: JSON.stringify(config) }),
  labels: (repos: string[]) =>
    request<LabelDef[]>(`/api/labels?repos=${encodeURIComponent(repos.join(","))}`),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
