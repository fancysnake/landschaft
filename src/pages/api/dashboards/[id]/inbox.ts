import { json, route, viewRequest } from "../../../../lib/server/api";
import { buildInbox } from "../../../../lib/server/board";

export const GET = route(async (context) => {
  const { config, dashboard, query, db, syncer, viewer } = await viewRequest(context, "inbox");
  const inbox = buildInbox(
    db.listIssues(config.repos),
    dashboard,
    query,
    config.users,
    viewer,
    db.listCiJobs(config.repos),
  );
  return json({ dashboard, inbox, status: syncer.status() });
});
