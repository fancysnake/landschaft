import { json, route } from "../../lib/server/api";
import { getApp } from "../../lib/server/app";

export const GET = route(() => json(getApp().syncer.status()));
