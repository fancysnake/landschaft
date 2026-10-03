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

/** On/off chips, plus a switch that turns them all on, or all off once they are all on. */
export function Toggles({ label, options, selected, onChange }: Props) {
  const allOn = options.every((option) => selected.includes(option.value));

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      {options.map((option) => {
        const on = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            title={option.value}
            onClick={() =>
              onChange(
                on ? selected.filter((v) => v !== option.value) : [...selected, option.value],
              )
            }
            className={`rounded-full border px-2.5 py-0.5 text-sm ${
              on
                ? "border-sky-500 bg-sky-50 text-sky-900"
                : "border-neutral-200 bg-white text-neutral-400 hover:border-sky-300"
            }`}
          >
            {option.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onChange(allOn ? [] : options.map((option) => option.value))}
        className="px-1.5 text-xs text-neutral-500 hover:text-neutral-900 hover:underline"
      >
        {allOn ? "none" : "all"}
      </button>
    </div>
  );
}
