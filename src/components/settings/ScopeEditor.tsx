import { BACKENDS, type Config, repoName, userName } from "../../lib/pacts/config";
import { ChipList } from "./ChipList";
import { Field } from "./Field";

type Scope = Pick<Config, "backend" | "repos" | "users" | "refreshMinutes">;

const BACKEND_NAMES: Record<Config["backend"], string> = { github: "GitHub", gitlab: "GitLab" };

interface Props {
  scope: Scope;
  onChange(scope: Scope): void;
}

/** The base set every dashboard filters: the backend, its repos, the users and the refresh interval. */
export function ScopeEditor({ scope, onChange }: Props) {
  const patch = (changes: Partial<Scope>) => onChange({ ...scope, ...changes });

  return (
    <div className="grid gap-4 lg:grid-cols-[10rem_1fr_1fr_10rem]">
      <Field
        label="Backend"
        hint="GitLab shows merge requests only, from the instance in GITLAB_URL with the token in GITLAB_TOKEN."
      >
        <select
          value={scope.backend}
          onChange={(event) => patch({ backend: event.target.value as Config["backend"] })}
          className="field w-32"
        >
          {BACKENDS.map((backend) => (
            <option key={backend} value={backend}>
              {BACKEND_NAMES[backend]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        group
        label="Repositories"
        hint="Every dashboard starts from these. Labels are suggested from them once they have synced (saving triggers the first sync)."
      >
        <ChipList
          items={scope.repos}
          onChange={(repos) => patch({ repos })}
          schema={repoName}
          placeholder={scope.backend === "gitlab" ? "group/project" : "owner/repo"}
        />
      </Field>

      <Field
        group
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
          className="field w-32"
        />
      </Field>
    </div>
  );
}
