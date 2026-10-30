import type { Offer } from "../pacts/filter";
import type {
  BoardDashboard,
  Config,
  Filters,
  HiddenReposRequest,
  InboxDashboard,
  StarEpicRequest,
  SyncRequest,
} from "../pacts/schema";
import type { Board, Card, Inbox, LabelDef, NavData, SyncStatus } from "../pacts/types";

/** Tells the islands on this page that the config was saved. */
export const CONFIG_SAVED = "landschaft:config-saved";

export interface BoardResponse {
  dashboard: BoardDashboard;
  board: Board;
  /** The repos switched off. */
  hidden: string[];
  status: SyncStatus;
}

export interface InboxResponse {
  dashboard: InboxDashboard;
  inbox: Inbox;
  /** The repos switched off. */
  hidden: string[];
  status: SyncStatus;
}

export interface UnmatchedResponse {
  items: Card[];
  /** Filter completions from every unmatched item, filtered out or not. */
  offer: Offer;
  status: SyncStatus;
}

/** A sync-all's answer, sent with `202` before any repo finishes. */
export interface SyncResponse {
  /** The run it joined, done once `status.runs` reaches it. */
  run: number;
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

const viewUrl = (dashboardId: string, view: "board" | "inbox", filters: Filters) =>
  `/api/dashboards/${encodeURIComponent(dashboardId)}/${view}?${filtersToQuery(filters)}`;

export const api = {
  board: (dashboardId: string, filters: Filters) =>
    request<BoardResponse>(viewUrl(dashboardId, "board", filters)),
  inbox: (dashboardId: string, filters: Filters) =>
    request<InboxResponse>(viewUrl(dashboardId, "inbox", filters)),
  unmatched: (filter: string) =>
    request<UnmatchedResponse>(`/api/unmatched?${new URLSearchParams({ filter })}`),
  version: () => request<SyncStatus>("/api/version"),
  sync: (body: Pick<SyncRequest, "full">) =>
    request<SyncResponse>("/api/sync", { method: "POST", body: JSON.stringify(body) }),
  setEpicStarred: (dashboardId: string, body: StarEpicRequest) =>
    request<{ starredEpics: string[] }>(
      `/api/dashboards/${encodeURIComponent(dashboardId)}/starred-epics`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  config: () => request<Config>("/api/config"),
  saveConfig: async (config: unknown) => {
    const saved = await request<Config>("/api/config", {
      method: "PUT",
      body: JSON.stringify(config),
    });
    window.dispatchEvent(new Event(CONFIG_SAVED));
    return saved;
  },
  setHidden: async (body: HiddenReposRequest) => {
    const saved = await request<{ hiddenRepos: string[] }>("/api/hidden-repos", {
      method: "POST",
      body: JSON.stringify(body),
    });
    window.dispatchEvent(new Event(CONFIG_SAVED));
    return saved;
  },
  nav: () => request<NavData>("/api/nav"),
  labels: (repos: string[]) =>
    request<LabelDef[]>(`/api/labels?repos=${encodeURIComponent(repos.join(","))}`),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
