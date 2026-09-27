import type { Epic } from "../../lib/types";

import { EpicTile } from "./EpicTile";

interface Props {
  epics: Epic[];
  active: string | undefined;
  onSelect(key: string | undefined): void;
}

export function EpicStrip({ epics, active, onSelect }: Props) {
  if (epics.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {epics.map((epic) => {
        const selected = epic.key === active;
        return (
          <EpicTile
            key={epic.key}
            epic={epic}
            selected={selected}
            onToggle={() => onSelect(selected ? undefined : epic.key)}
          />
        );
      })}
    </div>
  );
}
