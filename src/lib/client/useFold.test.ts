// @vitest-environment happy-dom
import { act } from "react";

import { renderHook } from "../__fixtures__/renderHook";
import { useFold } from "./useFold";

const { result, render } = renderHook(useFold);
const toggle = () => act(async () => result.current[1]());

describe("useFold", () => {
  it("follows the config until toggled", async () => {
    await render(true);
    expect(result.current[0]).toBe(true);
    await render(false);
    expect(result.current[0]).toBe(false);
  });

  it("keeps a toggle past a config change", async () => {
    await render(true);
    await toggle();
    expect(result.current[0]).toBe(false);
    await render(false);
    await toggle();
    expect(result.current[0]).toBe(true);
    await render(false);
    expect(result.current[0]).toBe(true);
  });
});
