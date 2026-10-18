// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ViewQuery } from "../schema";

import { api, type BoardResponse } from "./api";
import { type BoardController, useBoard } from "./useBoard";
import { SYNCED } from "./useSyncStatus";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, api: { board: vi.fn(), setEpicStarred: vi.fn() } };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const response = () => ({ status: { version: 1 } }) as BoardResponse;

const roots: Root[] = [];

async function renderBoard(initial: ViewQuery) {
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  const result: { current: BoardController | null } = { current: null };
  const report = (board: BoardController) => {
    result.current = board;
  };
  function Probe({ filters }: { filters: ViewQuery }) {
    report(useBoard("main", filters));
    return null;
  }
  const render = (filters: ViewQuery) =>
    act(async () => root.render(createElement(Probe, { filters })));
  await render(initial);
  return { result, render };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  vi.resetAllMocks();
});

const synced = (version: number) =>
  act(async () => void window.dispatchEvent(new CustomEvent(SYNCED, { detail: version })));

test("a landed sync reloads the board with the current query", async () => {
  vi.mocked(api.board).mockImplementation(() => Promise.resolve(response()));
  const { render } = await renderBoard({ hide: ["a", "b"] });
  await render({ hide: ["a"] });
  const calls = vi.mocked(api.board).mock.calls.length;

  await synced(1);
  expect(vi.mocked(api.board)).toHaveBeenCalledTimes(calls);

  await synced(2);
  expect(vi.mocked(api.board)).toHaveBeenCalledTimes(calls + 1);
  expect(vi.mocked(api.board).mock.lastCall?.[1]).toEqual({ hide: ["a"] });
});

test("a failed star stays reported after the reload", async () => {
  vi.mocked(api.board).mockImplementation(() => Promise.resolve(response()));
  vi.mocked(api.setEpicStarred).mockRejectedValue(new Error("boom"));
  const { result } = await renderBoard({});

  await act(() => result.current!.setEpicStarred("o/r#1", true));

  expect(result.current!.error).toBe("Starring epic failed: boom");
});

test("a stale board response does not replace a newer one", async () => {
  const pending: { board: BoardResponse; resolve: () => void }[] = [];
  vi.mocked(api.board).mockImplementation(() => {
    const board = response();
    const { promise, resolve } = Promise.withResolvers<BoardResponse>();
    pending.push({ board, resolve: () => resolve(board) });
    return promise;
  });
  const { result, render } = await renderBoard({ hide: ["a", "b"] });
  await render({ hide: ["a"] });

  const [older, newer] = pending;
  await act(async () => newer.resolve());
  await act(async () => older.resolve());

  expect(result.current!.data).toBe(newer.board);
});
