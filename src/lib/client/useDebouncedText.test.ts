// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { type DebouncedText, useDebouncedText } from "./useDebouncedText";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const valid = (text: string) => !text.includes("!");
const onCommit = vi.fn();
let root: Root;

async function render(initial: string) {
  root = createRoot(document.createElement("div"));
  const result: { current: DebouncedText | null } = { current: null };
  const report = (value: DebouncedText) => {
    result.current = value;
  };
  function Probe() {
    report(useDebouncedText(initial, { valid, onCommit }));
    return null;
  }
  await act(async () => root.render(createElement(Probe)));
  return result;
}

beforeEach(() => vi.useFakeTimers());

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.resetAllMocks();
});

test("an invalid initial text shows but does not commit", async () => {
  const result = await render("bad!");
  expect(result.current).toMatchObject({ text: "bad!", committed: "" });
});

test("text commits once typing pauses", async () => {
  const result = await render("");
  await act(async () => result.current!.setText("a"));
  await act(async () => vi.advanceTimersByTime(100));
  await act(async () => result.current!.setText("ab"));
  await act(async () => vi.advanceTimersByTime(249));
  expect(result.current!.committed).toBe("");
  await act(async () => vi.advanceTimersByTime(1));
  expect(result.current!.committed).toBe("ab");
  expect(onCommit.mock.calls).toEqual([["ab"]]);
});

test("invalid text never commits", async () => {
  const result = await render("ok");
  await act(async () => result.current!.setText("ok!"));
  await act(async () => vi.advanceTimersByTime(1000));
  expect(result.current!.committed).toBe("ok");
  expect(onCommit).not.toHaveBeenCalled();
});

test("reset sets both at once without a commit", async () => {
  const result = await render("ab");
  await act(async () => result.current!.reset(""));
  expect(result.current).toMatchObject({ text: "", committed: "" });
  await act(async () => vi.advanceTimersByTime(1000));
  expect(onCommit).not.toHaveBeenCalled();
});
