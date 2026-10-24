import { useId } from "react";

import { type Offer, suggestFilter } from "../../lib/pacts/filter";

/** A filter expression with completions for its last term and the parse error below it. */
export function FilterInput({
  value,
  onChange,
  offer,
  validate,
  placeholder,
}: {
  value: string;
  onChange(value: string): void;
  offer: Offer;
  /** The error to show for `value`, or null. */
  validate(value: string): string | null;
  placeholder: string;
}) {
  const listId = useId();
  const errorId = useId();
  const error = validate(value);
  return (
    <div>
      <input
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        spellCheck={false}
        className="field w-full font-mono aria-invalid:border-red-400"
      />
      <datalist id={listId}>
        {suggestFilter(value, offer).map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {error && (
        <p id={errorId} className="mt-0.5 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
