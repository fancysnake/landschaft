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

/** A service error class the endpoint answers with `status`. */
export type ErrorStatus = [new (...args: never[]) => Error, status: number];

/**
 * Wraps a handler so thrown errors become JSON responses: `errors` for the service errors this
 * endpoint expects, 400 for bad input, 500 for anything else.
 */
export function route(
  handler: (context: APIContext) => Promise<Response> | Response,
  errors: ErrorStatus[] = [],
): APIRoute {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      const expected = errors.find(([kind]) => error instanceof kind);
      if (expected && error instanceof Error) return json({ error: error.message }, expected[1]);
      if (error instanceof ZodError) {
        return json({ error: "validation failed", issues: error.issues }, 400);
      }
      console.error(error);
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  };
}
