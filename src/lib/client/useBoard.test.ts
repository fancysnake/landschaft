// @vitest-environment happy-dom
import { act } from "react";

import type { Filters } from "../pacts/views";

import { renderHook } from "../__fixtures__/renderHook";
import { api, type BoardResponse } from "./api";
import { useBoard } from "./useBoard";
import { SYNCED } from "./useSyncStatus";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, api: { board: vi.fn() } };
});

const response = () => ({ status: { version: 1 } }) as BoardResponse;

const { result, render } = renderHook((filters: Filters) => useBoard("main", filters));

afterEach(() => {
  vi.resetAllMocks();
});

const synced = (version: number) =>
  act(async () => void window.dispatchEvent(new CustomEvent(SYNCED, { detail: version })));

test("a landed sync reloads the board with the current query", async () => {
  vi.mocked(api.board).mockImplementation(() => Promise.resolve(response()));
  await render({ q: "a b" });
  await render({ q: "a" });
  const calls = vi.mocked(api.board).mock.calls.length;

  await synced(1);
  expect(vi.mocked(api.board)).toHaveBeenCalledTimes(calls);

  await synced(2);
  expect(vi.mocked(api.board)).toHaveBeenCalledTimes(calls + 1);
  expect(vi.mocked(api.board).mock.lastCall?.[1]).toEqual({ q: "a" });
});

test("a stale board response does not replace a newer one", async () => {
  const pending: { board: BoardResponse; resolve: () => void }[] = [];
  vi.mocked(api.board).mockImplementation(() => {
    const board = response();
    const { promise, resolve } = Promise.withResolvers<BoardResponse>();
    pending.push({ board, resolve: () => resolve(board) });
    return promise;
  });
  await render({ q: "a b" });
  await render({ q: "a" });

  const [older, newer] = pending;
  await act(async () => newer.resolve());
  await act(async () => older.resolve());

  expect(result.current.data).toBe(newer.board);
});
