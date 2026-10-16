import type { ReactNode } from "react";

export const input = "rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm";

export function Field({
  label,
  hint,
  group = false,
  children,
}: {
  label: string;
  hint?: string;
  /** For several controls, which a `<label>` would not name: clicking it hits the first one. */
  group?: boolean;
  children: ReactNode;
}) {
  const Root = group ? "fieldset" : "label";
  const Title = group ? "legend" : "span";
  return (
    <Root className="block">
      <Title className="mb-1 block text-sm font-medium">{label}</Title>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </Root>
  );
}
