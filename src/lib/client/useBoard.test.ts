// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import type { Filters } from "../schema";

import { api, type BoardResponse, filtersToQuery, type SyncResponse } from "./api";
import { type BoardController, useBoard } from "./useBoard";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, api: { board: vi.fn(), sync: vi.fn(), version: vi.fn() } };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A board response tagged with the query it answers. */
const response = (filters: Filters) =>
  ({ tag: filtersToQuery(filters), status: { version: 1 } }) as unknown as BoardResponse;
const tagOf = (data: BoardResponse | null) => (data as { tag?: string } | null)?.tag;

function renderBoard(initial: Filters) {
  const container = document.createElement("div");
  const root = createRoot(container);
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
  return { result, render, ready: render(initial), unmount: () => act(async () => root.unmount()) };
}

afterEach(() => vi.resetAllMocks());

test("a reload after sync uses the filters current when the sync finishes", async () => {
  vi.mocked(api.board).mockImplementation((_, filters) => Promise.resolve(response(filters)));
  const sync = Promise.withResolvers<SyncResponse>();
  vi.mocked(api.sync).mockReturnValue(sync.promise);
  const { result, render, ready, unmount } = renderBoard({ repo: ["a", "b"] });
  await ready;

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
  expect(tagOf(result.current!.data)).toBe("repo=a");
  await unmount();
});

test("a stale board response does not replace a newer one", async () => {
  const pending: { filters: Filters; resolve: (value: BoardResponse) => void }[] = [];
  vi.mocked(api.board).mockImplementation((_, filters) => {
    const { promise, resolve } = Promise.withResolvers<BoardResponse>();
    pending.push({ filters, resolve });
    return promise;
  });
  const { result, render, ready, unmount } = renderBoard({ repo: ["a", "b"] });
  await ready;
  await render({ repo: ["a"] });

  const [older, newer] = pending;
  await act(async () => newer.resolve(response(newer.filters)));
  await act(async () => older.resolve(response(older.filters)));

  expect(tagOf(result.current!.data)).toBe("repo=a");
  await unmount();
});
