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
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(allOn ? [] : options.map((option) => option.value))}
        className="rounded-full px-2 text-xs font-medium text-neutral-500 hover:text-neutral-900"
      >
        {allOn ? "none" : "all"}
      </button>
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
            className={`rounded-full border px-2.5 text-sm leading-6 transition-colors ${
              on
                ? "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-700"
                : "border-neutral-300 bg-white text-neutral-500 hover:border-neutral-500 hover:text-neutral-800"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
