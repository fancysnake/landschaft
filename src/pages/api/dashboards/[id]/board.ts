import { getApp } from "../../../../lib/inits";
import { buildBoard } from "../../../../lib/mills/board";
import { json, route, viewRequest } from "../../_route";

export const GET = route(async (context) => {
  const { dashboard, query, snapshot, ...audience } = await viewRequest(context, "board");
  const { db, syncer } = getApp();
  const board = buildBoard(snapshot, dashboard, {
    ...audience,
    query,
    starred: db.starredEpics(dashboard.id),
  });
  return json({ dashboard, board, status: syncer.status() });
});
