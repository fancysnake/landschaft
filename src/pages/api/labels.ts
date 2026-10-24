import { getApp } from "../../lib/inits";
import { json, route } from "./_route";

export const GET = route(({ url }) => {
  const repos = (url.searchParams.get("repos") ?? "").split(",").filter(Boolean);
  return json(getApp().db.listLabels(repos));
});
