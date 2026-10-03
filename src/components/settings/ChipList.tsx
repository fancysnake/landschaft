import type { z } from "zod";

import { type KeyboardEvent, useState } from "react";

interface Props {
  items: string[];
  onChange(items: string[]): void;
  /** Validates a new entry; its first error message shows when it fails. */
  schema: z.ZodType<string>;
  placeholder: string;
}

export function ChipList({ items, onChange, schema, placeholder }: Props) {
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);

  const add = () => {
    const trimmed = text.trim();
    const parsed = schema.safeParse(trimmed);
    if (!parsed.success) {
      setInvalid(trimmed === "" ? null : (parsed.error.issues[0]?.message ?? "invalid"));
      return;
    }
    if (!items.includes(parsed.data)) onChange([...items, parsed.data]);
    setText("");
    setInvalid(null);
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      add();
    }
  };

  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-1">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-center gap-1 rounded-full bg-neutral-200 px-2 text-sm leading-6"
          >
            {item}
            <button
              type="button"
              onClick={() => onChange(items.filter((i) => i !== item))}
              aria-label={`Remove ${item}`}
              className="text-neutral-500 hover:text-neutral-900"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={keyDown}
          placeholder={placeholder}
          className={`w-64 rounded-md border px-2 py-1 text-sm ${
            invalid ? "border-red-400" : "border-neutral-300"
          }`}
        />
        <button
          type="button"
          onClick={add}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm hover:bg-neutral-50"
        >
          Add
        </button>
        {invalid && <span className="self-center text-xs text-red-700">{invalid}</span>}
      </div>
    </div>
  );
}
