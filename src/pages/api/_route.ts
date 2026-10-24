import type { APIContext, APIRoute } from "astro";

import { ZodError, type ZodType } from "zod";

import type { Audience } from "../../lib/mills/board";
import type { NavData, Snapshot } from "../../lib/pacts/types";

import { getApp } from "../../lib/inits";
import { findDashboard, loadConfig } from "../../lib/links/config/file";
import { scopedRepos } from "../../lib/mills/board";
import {
  type Config,
  type Dashboard,
  type DashboardType,
  ViewQuerySchema,
} from "../../lib/pacts/schema";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function parseBody<T>(schema: ZodType<T>, request: Request): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "invalid JSON body");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(schema: ZodType<T>, url: URL): T {
  return schema.parse(Object.fromEntries(url.searchParams));
}

/**
 * The cached issues and jobs of the configured repos and who views them; `viewer` is null when it
 * cannot be fetched.
 */
export async function viewData({
  repos,
  users,
}: Pick<Config, "repos" | "users">): Promise<Audience & { snapshot: Snapshot }> {
  const { db, syncer } = getApp();
  return { snapshot: db.snapshot(repos), users, viewer: await syncer.viewer().catch(() => null) };
}

/**
 * What a view endpoint works from: the dashboard of `type` the URL names (404 otherwise), the
 * query, and `viewData`.
 */
export async function viewRequest<T extends DashboardType>({ params, url }: APIContext, type: T) {
  const config = loadConfig();
  const dashboard = findDashboard(config, params.id ?? "");
  const isType = (d: Dashboard | undefined): d is Extract<Dashboard, { type: T }> =>
    d?.type === type;
  if (!isType(dashboard)) throw new ApiError(404, `${type} not found`);
  const query = parseQuery(ViewQuerySchema, url);
  return { dashboard, query, ...(await viewData(config)) };
}

export async function navData(): Promise<NavData> {
  const config = loadConfig();
  const { snapshot, ...audience } = await viewData(config);
  return {
    dashboards: config.dashboards.map(({ id, name, filter }) => ({
      id,
      name,
      repos: [...scopedRepos(snapshot, { filter }, audience)],
    })),
    repos: config.repos,
  };
}

/** Wraps a handler so thrown errors become JSON responses with a fitting status. */
export function route(handler: (context: APIContext) => Promise<Response> | Response): APIRoute {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      if (error instanceof ZodError) {
        return json({ error: "validation failed", issues: error.issues }, 400);
      }
      console.error(error);
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  };
}
