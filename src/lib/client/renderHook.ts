import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const unmounts: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const unmount of unmounts.splice(0)) await unmount();
});

/**
 * Test harness for a hook: `render(...args)` calls it inside a component and
 * `result.current` holds what it last returned. Each test gets a fresh mount,
 * so one call at module level serves every test in the file.
 */
export function renderHook<Args extends unknown[], Value>(useHook: (...args: Args) => Value) {
  const result: { current: Value | null } = { current: null };
  const report = (value: Value) => {
    result.current = value;
  };
  function Probe({ args }: { args: Args }) {
    report(useHook(...args));
    return null;
  }
  let root: Root | null = null;
  const mount = () => {
    const mounted = createRoot(document.createElement("div"));
    unmounts.push(() =>
      act(async () => {
        mounted.unmount();
        root = null;
        result.current = null;
      }),
    );
    return mounted;
  };
  const render = (...args: Args) =>
    act(async () => {
      root ??= mount();
      root.render(createElement(Probe, { args }));
    });
  return { result, render };
}
