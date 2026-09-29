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

/** On/off chips; the last chip still on cannot be switched off. */
export function Toggles({ label, options, selected, onChange }: Props) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((option) => {
        const on = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            disabled={on && selected.length === 1}
            title={option.value}
            onClick={() =>
              onChange(
                on
                  ? selected.filter((value) => value !== option.value)
                  : [...selected, option.value],
              )
            }
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
    </div>
  );
}
