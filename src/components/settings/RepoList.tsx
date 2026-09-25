import { type KeyboardEvent, useState } from "react";

interface Props {
  repos: string[];
  onChange(repos: string[]): void;
}

const REPO = /^[\w.-]+\/[\w.-]+$/;

export function RepoList({ repos, onChange }: Props) {
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);

  const add = () => {
    const trimmed = text.trim();
    if (!REPO.test(trimmed)) {
      setInvalid(trimmed !== "");
      return;
    }
    if (!repos.includes(trimmed)) onChange([...repos, trimmed]);
    setText("");
    setInvalid(false);
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
        {repos.map((repo) => (
          <li
            key={repo}
            className="flex items-center gap-1 rounded-full bg-neutral-200 px-2 text-sm leading-6"
          >
            {repo}
            <button
              type="button"
              onClick={() => onChange(repos.filter((r) => r !== repo))}
              aria-label={`Remove ${repo}`}
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
          placeholder="owner/repo"
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
        {invalid && <span className="self-center text-xs text-red-700">expected owner/repo</span>}
      </div>
    </div>
  );
}
