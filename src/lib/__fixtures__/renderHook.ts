import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Test harness for a hook: `render(...args)` calls it inside a component and
 * `result.current` holds what it last returned. Each test gets a fresh mount,
 * so one call at module level serves every test in the file.
 */
export function renderHook<Args extends unknown[], Value>(useHook: (...args: Args) => Value) {
  let rendered: { value: Value } | null = null;
  const result = {
    get current(): Value {
      if (!rendered) throw new Error("renderHook: nothing is rendered");
      return rendered.value;
    },
  };
  const report = (value: Value) => {
    rendered = { value };
  };
  function Probe({ args }: { args: Args }) {
    report(useHook(...args));
    return null;
  }
  let root: Root | null = null;
  const mount = () => {
    const mounted = createRoot(document.createElement("div"));
    onTestFinished(() =>
      act(async () => {
        mounted.unmount();
        root = null;
        rendered = null;
      }),
    );
    return mounted;
  };
  const render = (...args: Args) => {
    const mounted = (root ??= mount());
    return act(async () => mounted.render(createElement(Probe, { args })));
  };
  return { result, render };
}
