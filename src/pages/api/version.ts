import { getApp } from "../../lib/inits";
import { json, route } from "./_route";

export const GET = route(() => json(getApp().syncer.status()));
