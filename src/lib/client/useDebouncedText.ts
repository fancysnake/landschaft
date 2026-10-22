import { useEffect, useState } from "react";

const DELAY_MS = 250;
const always = () => true;

export interface DebouncedText {
  /** What the input shows. */
  text: string;
  setText(text: string): void;
  /** The last valid text, settled for the delay. */
  committed: string;
  /** Sets both at once, skipping the delay and `onCommit`. */
  reset(text: string): void;
}

/**
 * Text typed into an input that commits once typing pauses, and only when `valid` accepts it.
 * `valid` and `onCommit` must be stable, or every render restarts the delay.
 */
export function useDebouncedText(
  initial: string,
  {
    valid = always,
    onCommit,
  }: { valid?: (text: string) => boolean; onCommit?(text: string): void } = {},
): DebouncedText {
  const [text, setText] = useState(initial);
  const [committed, setCommitted] = useState(() => (valid(initial) ? initial : ""));

  useEffect(() => {
    if (text === committed || !valid(text)) return;
    const timer = setTimeout(() => {
      setCommitted(text);
      onCommit?.(text);
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, committed, valid, onCommit]);

  const reset = (next: string) => {
    setText(next);
    setCommitted(next);
  };
  return { text, setText, committed, reset };
}
