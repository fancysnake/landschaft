import { json, route } from "./_route";

export const GET = route(async ({ locals }) => json(await locals.services.views.nav()));
