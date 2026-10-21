import { json, route } from "../../lib/server/api";
import { navData } from "../../lib/server/nav";

export const GET = route(async () => json(await navData()));
