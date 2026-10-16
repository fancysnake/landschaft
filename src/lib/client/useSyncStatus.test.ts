// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { SyncStatus } from "../types";

import { api, type SyncResponse } from "./api";
import { SYNCED, type SyncController, useSyncStatus } from "./useSyncStatus";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, api: { sync: vi.fn(), version: vi.fn() } };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const status = (version: number, extra: Partial<SyncStatus> = {}) =>
  ({ version, inFlight: [], lastError: null, ...extra }) as SyncStatus;

let root: Root;

async function renderStatus() {
  root = createRoot(document.createElement("div"));
  const result: { current: SyncController | null } = { current: null };
  const report = (controller: SyncController) => {
    result.current = controller;
  };
  function Probe() {
    report(useSyncStatus());
    return null;
  }
  await act(async () => root.render(createElement(Probe)));
  return result;
}

afterEach(async () => {
  await act(async () => root.unmount());
  vi.resetAllMocks();
});

test("a changed version is announced, the first one is not", async () => {
  const announced: unknown[] = [];
  const listen = (event: Event) => announced.push((event as CustomEvent).detail);
  window.addEventListener(SYNCED, listen);
  vi.mocked(api.version).mockResolvedValueOnce(status(1)).mockResolvedValue(status(2));
  vi.mocked(api.sync).mockResolvedValue({} as SyncResponse);

  const result = await renderStatus();
  await act(() => result.current!.sync());

  window.removeEventListener(SYNCED, listen);
  expect(announced).toEqual([2]);
});

test("a sync reports the error it finished with", async () => {
  vi.mocked(api.version)
    .mockResolvedValueOnce(status(1))
    .mockResolvedValueOnce(status(1, { inFlight: ["o/r"] }))
    .mockResolvedValue(status(2, { lastError: "rate limited" }));
  vi.mocked(api.sync).mockResolvedValue({} as SyncResponse);

  const result = await renderStatus();
  await act(() => result.current!.sync());
  expect(result.current!.error).toBeNull();

  await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
  expect(result.current!.error).toBe("rate limited");
});

test("a refused sync is reported", async () => {
  vi.mocked(api.version).mockResolvedValue(status(1));
  vi.mocked(api.sync).mockRejectedValue(new Error("409"));

  const result = await renderStatus();
  await act(() => result.current!.sync());

  expect(result.current!.error).toBe("Sync failed: 409");
});
