// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useDebouncedText } from "./useDebouncedText";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const valid = (text: string) => !text.includes("!");
const onCommit = vi.fn();
let root: Root;
const result: { current: ReturnType<typeof useDebouncedText> | null } = { current: null };
const report = (value: ReturnType<typeof useDebouncedText>) => {
  result.current = value;
};

type Options = Parameters<typeof useDebouncedText>[2];

function Probe({ committed, options }: { committed: string; options: Options }) {
  report(useDebouncedText(committed, onCommit, options));
  return null;
}

const show = (committed: string, options: Options = { valid }) =>
  act(async () => root.render(createElement(Probe, { committed, options })));
const type = (text: string) => act(async () => result.current![1](text));
const wait = (ms: number) => act(async () => vi.advanceTimersByTime(ms));

beforeEach(async () => {
  vi.useFakeTimers();
  root = createRoot(document.createElement("div"));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.resetAllMocks();
});

test("text commits once typing pauses", async () => {
  await show("");
  await type("a");
  await wait(100);
  await type("ab");
  await wait(249);
  expect(onCommit).not.toHaveBeenCalled();
  await wait(1);
  expect(onCommit.mock.calls).toEqual([["ab"]]);
});

test("without valid, clearing the text commits it", async () => {
  await show("ab", {});
  await type("");
  await wait(250);
  expect(onCommit.mock.calls).toEqual([[""]]);
});

test("invalid text never commits", async () => {
  await show("ok");
  await type("ok!");
  await wait(1000);
  expect(onCommit).not.toHaveBeenCalled();
});

test("text follows committed without a commit", async () => {
  await show("ab");
  await type("abc");
  await show("");
  expect(result.current![0]).toBe("");
  await wait(1000);
  expect(onCommit).not.toHaveBeenCalled();
});
