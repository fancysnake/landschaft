import { useState } from "react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  label: string;
  options: Option[];
  selected: string[];
  onChange(selected: string[]): void;
}

/**
 * On/off chips; the last chip still on cannot be switched off. "none" only clears the chips:
 * the selection stays until a chip is picked, which then becomes the only one on.
 */
export function Toggles({ label, options, selected, onChange }: Props) {
  const [cleared, setCleared] = useState(false);
  const allOn = options.every((option) => selected.includes(option.value));

  const pick = (value: string, on: boolean) => {
    if (cleared) {
      setCleared(false);
      onChange([value]);
    } else {
      onChange(on ? selected.filter((v) => v !== value) : [...selected, value]);
    }
  };
  const toggleAll = () => {
    if (cleared) setCleared(false);
    else if (allOn) setCleared(true);
    else onChange(options.map((option) => option.value));
  };

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      {options.map((option) => {
        const on = !cleared && selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            disabled={on && selected.length === 1}
            title={option.value}
            onClick={() => pick(option.value, on)}
            className={`rounded-full border px-2.5 py-0.5 text-sm ${
              on
                ? "border-sky-500 bg-sky-50 text-sky-900 disabled:cursor-default"
                : "border-neutral-200 bg-white text-neutral-400 hover:border-sky-300"
            }`}
          >
            {option.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={toggleAll}
        className="px-1.5 text-xs text-neutral-500 hover:text-neutral-900 hover:underline"
      >
        {allOn && !cleared ? "none" : "all"}
      </button>
    </div>
  );
}
