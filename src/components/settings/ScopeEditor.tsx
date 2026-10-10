import { type Config, repoName, userName } from "../../lib/schema";
import { ChipList } from "./ChipList";
import { Field, input } from "./Field";

type Scope = Pick<Config, "repos" | "users" | "refreshMinutes">;

interface Props {
  scope: Scope;
  onChange(scope: Scope): void;
}

/** The base set every dashboard filters: the global repos, users and refresh interval. */
export function ScopeEditor({ scope, onChange }: Props) {
  const patch = (changes: Partial<Scope>) => onChange({ ...scope, ...changes });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr_10rem]">
      <Field
        label="Repositories"
        hint="Every dashboard starts from these. Labels are suggested from them once they have synced (saving triggers the first sync)."
      >
        <ChipList
          items={scope.repos}
          onChange={(repos) => patch({ repos })}
          schema={repoName}
          placeholder="owner/repo"
        />
      </Field>

      <Field
        label="Users"
        hint="Only issues and pull requests these users created or are assigned to; @me is you (the token's account). Empty shows everyone's."
      >
        <ChipList
          items={scope.users}
          onChange={(users) => patch({ users })}
          schema={userName}
          placeholder="login or @me"
        />
      </Field>

      <Field label="Refresh (min)" hint="How often each repository syncs.">
        <input
          type="number"
          min={1}
          max={1440}
          value={scope.refreshMinutes}
          onChange={(event) => patch({ refreshMinutes: Number(event.target.value) || 1 })}
          className={`${input} w-32`}
        />
      </Field>
    </div>
  );
}
