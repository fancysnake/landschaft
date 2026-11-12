// @vitest-environment happy-dom
import { act } from "react";

import { renderHook } from "../__fixtures__/renderHook";
import { useDebouncedText } from "./useDebouncedText";

const valid = (text: string) => !text.includes("!");
const onCommit = vi.fn();

type Options = Parameters<typeof useDebouncedText>[2];

const { result, render } = renderHook((committed: string, options: Options = { valid }) =>
  useDebouncedText(committed, onCommit, options),
);

const type = (text: string) => act(async () => result.current[1](text));
const wait = (ms: number) => act(async () => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

test("text commits once typing pauses", async () => {
  await render("");
  await type("a");
  await wait(100);
  await type("ab");
  await wait(249);
  expect(onCommit).not.toHaveBeenCalled();
  await wait(1);
  expect(onCommit.mock.calls).toEqual([["ab"]]);
});

test("without valid, clearing the text commits it", async () => {
  await render("ab", {});
  await type("");
  await wait(250);
  expect(onCommit.mock.calls).toEqual([[""]]);
});

test("invalid text never commits", async () => {
  await render("ok");
  await type("ok!");
  await wait(1000);
  expect(onCommit).not.toHaveBeenCalled();
});

test("text follows committed without a commit", async () => {
  await render("ab");
  await type("abc");
  await render("");
  expect(result.current[0]).toBe("");
  await wait(1000);
  expect(onCommit).not.toHaveBeenCalled();
});
