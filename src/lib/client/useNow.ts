import { useEffect, useState } from "react";

const EVERY_MS = 15_000;

/** The current time, refreshed every 15 s, for relative ages. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), EVERY_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}
