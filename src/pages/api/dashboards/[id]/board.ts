import { json, route, viewRequest } from "../../../../lib/server/api";
import { buildBoard } from "../../../../lib/server/board";

export const GET = route(async (context) => {
  const { config, dashboard, query, db, syncer, viewer } = await viewRequest(context, "board");
  const board = buildBoard(db.snapshot(config.repos), dashboard, {
    filters: query,
    users: config.users,
    starred: db.starredEpics(dashboard.id),
    viewer,
  });
  return json({ dashboard, board, status: syncer.status() });
});
