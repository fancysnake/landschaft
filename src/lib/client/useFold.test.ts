// @vitest-environment happy-dom
import { act } from "react";

import { renderHook } from "./renderHook";
import { useFold } from "./useFold";

const { result, render: show } = renderHook(useFold);
const toggle = () => act(async () => result.current![1]());

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
