import { json, route, viewRequest } from "../../../../lib/server/api";
import { getApp } from "../../../../lib/server/app";
import { buildInbox } from "../../../../lib/server/board";

export const GET = route(async (context) => {
  const { dashboard, query, snapshot, ...audience } = await viewRequest(context, "inbox");
  const inbox = buildInbox(snapshot, dashboard, { ...audience, query });
  return json({ dashboard, inbox, status: getApp().syncer.status() });
});
