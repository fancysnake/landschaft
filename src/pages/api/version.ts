import { json, route } from "./_route";

export const GET = route(({ locals }) => json(locals.services.sync.status()));
