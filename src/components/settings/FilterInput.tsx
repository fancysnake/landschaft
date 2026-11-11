import { useId, useLayoutEffect, useRef, useState } from "react";

import { type Offer, suggestFilter } from "../../lib/pacts/filter";

/**
 * A filter expression, shown whole, with completions for its last term and the parse error
 * below it.
 */
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
  const errorId = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const error = validate(value);
  // Escape hides the completions until the next edit, so Tab leaves the field.
  const [dismissed, setDismissed] = useState(false);

  // shortcut: the height is set on render, not on resize, so a narrower window can clip the
  // last line until the next edit; observe the size if that shows.
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`;
  });

  return (
    <div
      className="group"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        setDismissed(true);
        area.current?.focus();
      }}
    >
      <textarea
        ref={area}
        rows={1}
        value={value}
        onChange={(event) => {
          setDismissed(false);
          onChange(event.target.value);
        }}
        placeholder={placeholder}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        spellCheck={false}
        className="field block w-full resize-none overflow-hidden font-mono aria-invalid:border-red-400"
      />
      <ul
        aria-label="Completions"
        className={`mt-1 hidden max-h-24 flex-wrap gap-1 overflow-auto ${dismissed ? "" : "group-focus-within:flex"}`}
      >
        {suggestFilter(value, offer).map(({ text, label }) => (
          <li key={text}>
            <button
              type="button"
              // Safari does not focus a clicked button; keep the focus so the list stays shown.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(text);
                area.current?.focus();
              }}
              className="btn btn-sm font-mono"
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p id={errorId} className="mt-0.5 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
