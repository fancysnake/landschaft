import { json, route } from "./_route";

export const GET = route(({ locals, url }) => {
  const repos = (url.searchParams.get("repos") ?? "").split(",").filter(Boolean);
  return json(locals.services.views.labels(repos));
});
