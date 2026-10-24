import { navData } from "../../lib/inits";
import { json, route } from "./_route";

export const GET = route(async () => json(await navData()));
