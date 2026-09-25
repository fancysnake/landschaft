import { json, route } from "../../lib/server/api";
import { getApp } from "../../lib/server/app";

export const GET = route(({ url }) => {
  const repos = (url.searchParams.get("repos") ?? "").split(",").filter(Boolean);
  return json(getApp().db.listLabels(repos));
});
