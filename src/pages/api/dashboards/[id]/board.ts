import { json, route, viewRequest } from "../../../../lib/server/api";
import { getApp } from "../../../../lib/server/app";
import { buildBoard } from "../../../../lib/server/board";

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
