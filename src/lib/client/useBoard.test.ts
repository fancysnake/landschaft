// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { Filters } from "../schema";

import { api, type BoardResponse, filtersToQuery, type SyncResponse } from "./api";
import { type BoardController, useBoard } from "./useBoard";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, api: { board: vi.fn(), sync: vi.fn(), version: vi.fn() } };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const response = () => ({ status: { version: 1 } }) as BoardResponse;

const roots: Root[] = [];

async function renderBoard(initial: Filters) {
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  const result: { current: BoardController | null } = { current: null };
  const report = (board: BoardController) => {
    result.current = board;
  };
  function Probe({ filters }: { filters: Filters }) {
    report(useBoard("main", filters));
    return null;
  }
  const render = (filters: Filters) =>
    act(async () => root.render(createElement(Probe, { filters })));
  await render(initial);
  return { result, render };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  vi.resetAllMocks();
});

test("a reload after sync uses the filters current when the sync finishes", async () => {
  const responses = new Map<string, BoardResponse>();
  vi.mocked(api.board).mockImplementation((_, filters) => {
    const board = response();
    responses.set(filtersToQuery(filters), board);
    return Promise.resolve(board);
  });
  const sync = Promise.withResolvers<SyncResponse>();
  vi.mocked(api.sync).mockReturnValue(sync.promise);
  const { result, render } = await renderBoard({ repo: ["a", "b"] });

  let syncing!: Promise<void>;
  await act(async () => {
    syncing = result.current!.sync(true);
  });
  await render({ repo: ["a"] });
  await act(async () => {
    sync.resolve({ status: {} } as SyncResponse);
    await syncing;
  });

  expect(vi.mocked(api.board).mock.lastCall?.[1]).toEqual({ repo: ["a"] });
  expect(result.current!.data).toBe(responses.get("repo=a"));
});

test("a stale board response does not replace a newer one", async () => {
  const pending: { board: BoardResponse; resolve: () => void }[] = [];
  vi.mocked(api.board).mockImplementation(() => {
    const board = response();
    const { promise, resolve } = Promise.withResolvers<BoardResponse>();
    pending.push({ board, resolve: () => resolve(board) });
    return promise;
  });
  const { result, render } = await renderBoard({ repo: ["a", "b"] });
  await render({ repo: ["a"] });

  const [older, newer] = pending;
  await act(async () => newer.resolve());
  await act(async () => older.resolve());

  expect(result.current!.data).toBe(newer.board);
});
