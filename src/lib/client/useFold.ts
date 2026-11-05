import { useState } from "react";

/** Whether an entry is folded and how to flip it: `configured` until toggled on this page. */
export function useFold(configured: boolean): [boolean, () => void] {
  const [override, setOverride] = useState<boolean | null>(null);
  const collapsed = override ?? configured;
  return [collapsed, () => setOverride(!collapsed)];
}
