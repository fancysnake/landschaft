import { useEffect, useEffectEvent, useState } from "react";

const DELAY_MS = 250;
const always = () => true;

/**
 * Input text over a value the caller owns: hands text to `onCommit` once typing pauses, and only
 * when `valid` accepts it. The text follows `committed` whenever that changes.
 */
export function useDebouncedText(
  committed: string,
  onCommit: (text: string) => void,
  { valid = always }: { valid?: (text: string) => boolean } = {},
): [string, (text: string) => void] {
  const [text, setText] = useState(committed);
  const [followed, setFollowed] = useState(committed);
  if (committed !== followed) {
    setFollowed(committed);
    setText(committed);
  }

  const commit = useEffectEvent(onCommit);
  const accepts = useEffectEvent(valid);
  useEffect(() => {
    if (text === committed || !accepts(text)) return;
    const timer = setTimeout(() => commit(text), DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, committed]);

  return [text, setText];
}
