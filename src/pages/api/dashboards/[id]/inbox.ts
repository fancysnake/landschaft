import { getApp } from "../../../../lib/inits";
import { buildInbox } from "../../../../lib/mills/board";
import { json, route, viewRequest } from "../../_route";

export const GET = route(async (context) => {
  const { dashboard, query, snapshot, ...audience } = await viewRequest(context, "inbox");
  const inbox = buildInbox(snapshot, dashboard, { ...audience, query });
  return json({ dashboard, inbox, status: getApp().syncer.status() });
});
