import type { APIContext, APIRoute } from "astro";

import { ZodError, type ZodType } from "zod";

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
