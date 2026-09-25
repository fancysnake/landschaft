import { type KeyboardEvent, useId, useState } from "react";

import type { LabelDef } from "../../lib/types";

import { labelStyle } from "../../lib/client/labels";

interface Props {
  value: string[];
  onChange(value: string[]): void;
  options: LabelDef[];
  placeholder?: string;
  /** Replace instead of append; the picker then holds at most one label. */
  single?: boolean;
}

/** Chips plus a free-text input with suggestions from the synced label catalogue. */
export function LabelPicker({ value, onChange, options, placeholder, single }: Props) {
  const listId = useId();
  const [text, setText] = useState("");
  const colors = new Map(options.map((label) => [label.name, label.color]));
  const names = [...new Set(options.map((label) => label.name))].filter((n) => !value.includes(n));

  const add = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange(single ? [trimmed] : [...value, trimmed]);
    setText("");
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      add(text);
    } else if (event.key === "Backspace" && text === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-neutral-300 bg-white px-1.5 py-1">
      {value.map((name) => (
        <span
          key={name}
          style={labelStyle(colors.get(name) ?? "e5e5e5")}
          className="flex items-center gap-1 rounded-full px-2 text-xs leading-5"
        >
          {name}
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v !== name))}
            aria-label={`Remove ${name}`}
            className="opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </span>
      ))}
      {(!single || value.length === 0) && (
        <input
          list={listId}
          value={text}
          onChange={(event) => {
            const next = event.target.value;
            if (names.includes(next)) add(next);
            else setText(next);
          }}
          onKeyDown={keyDown}
          onBlur={() => text && add(text)}
          placeholder={placeholder ?? (value.length === 0 ? "no label = catch-all" : "add label")}
          className="min-w-32 flex-1 bg-transparent px-1 text-sm outline-none"
        />
      )}
      <datalist id={listId}>
        {names.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  );
}
