/** Colours for a `pill`. */
export const TONE = {
  green: "bg-green-50 text-green-700 ring-green-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  neutral: "bg-neutral-100 text-neutral-600 ring-neutral-200",
} as const;

export type Tone = keyof typeof TONE;

/** A status dot while its sync runs. */
export const SYNCING_DOT = "bg-violet-500 motion-safe:animate-pulse";
