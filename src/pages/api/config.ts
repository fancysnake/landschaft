import { ConfigSchema } from "../../lib/pacts/schema";
import { json, parseBody, route } from "./_route";

export const GET = route(({ locals }) => json(locals.services.config.load()));

export const PUT = route(async ({ locals, request }) =>
  json(locals.services.config.save(await parseBody(ConfigSchema, request))),
);
