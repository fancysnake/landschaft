// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useFold } from "./useFold";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
const result: { current: ReturnType<typeof useFold> | null } = { current: null };
const report = (value: ReturnType<typeof useFold>) => {
  result.current = value;
};

function Probe({ configured }: { configured: boolean }) {
  report(useFold(configured));
  return null;
}

const show = (configured: boolean) =>
  act(async () => root.render(createElement(Probe, { configured })));
const toggle = () => act(async () => result.current![1]());

beforeEach(() => {
  root = createRoot(document.createElement("div"));
});

afterEach(() => act(async () => root.unmount()));

describe("useFold", () => {
  it("follows the config until toggled", async () => {
    await show(true);
    expect(result.current![0]).toBe(true);
    await show(false);
    expect(result.current![0]).toBe(false);
  });

  it("keeps a toggle past a config change", async () => {
    await show(true);
    await toggle();
    expect(result.current![0]).toBe(false);
    await show(false);
    await toggle();
    expect(result.current![0]).toBe(true);
    await show(false);
    expect(result.current![0]).toBe(true);
  });
});
