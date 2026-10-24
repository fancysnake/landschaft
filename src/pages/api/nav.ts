import { json, navData, route } from "./_route";

export const GET = route(async () => json(await navData()));
