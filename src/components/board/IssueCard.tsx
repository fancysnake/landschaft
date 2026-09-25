import type { DragEvent } from "react";

import type { Card } from "../../lib/types";

import { type DragPayload, setPayload } from "../../lib/client/dnd";
import { labelStyle, repoShortName } from "../../lib/client/labels";

interface Props {
  card: Card;
  laneId: string;
  colId: string;
  showRepo: boolean;
  onDragStart(payload: DragPayload): void;
  onDragEnd(): void;
}

export function IssueCard({ card, laneId, colId, showRepo, onDragStart, onDragEnd }: Props) {
  const start = (event: DragEvent) => {
    const payload = { card, laneId, colId };
    setPayload(event, payload);
    onDragStart(payload);
  };
  return (
    <article
      draggable
      onDragStart={start}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-md border bg-white p-2 text-sm shadow-xs active:cursor-grabbing ${
        card.blocked ? "border-red-300" : card.isEpic ? "border-violet-300" : "border-neutral-200"
      }`}
    >
      <div className="mb-1 flex items-center gap-1.5 text-xs text-neutral-500">
        <span className="font-mono">
          {showRepo ? `${repoShortName(card.repo)}#` : "#"}
          {card.number}
        </span>
        {card.isEpic && <span className="rounded bg-violet-100 px-1 text-violet-800">epic</span>}
        {card.blocked && <span className="rounded bg-red-100 px-1 text-red-800">blocked</span>}
        {card.assignees.length > 0 && (
          <span className="ml-auto flex -space-x-1">
            {card.assignees.map((assignee) => (
              <img
                key={assignee.login}
                src={assignee.avatarUrl}
                alt={assignee.login}
                title={assignee.login}
                className="h-5 w-5 rounded-full border border-white bg-neutral-200"
              />
            ))}
          </span>
        )}
      </div>
      <a
        href={card.url}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-neutral-900 hover:underline"
      >
        {card.title}
      </a>
      {card.labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {card.labels.map((label) => (
            <span
              key={label.name}
              style={labelStyle(label.color)}
              className="rounded-full px-1.5 text-[11px] leading-4"
            >
              {label.name}
            </span>
          ))}
        </div>
      )}
      {card.progress && (
        <div
          className="mt-2"
          title={`${card.progress.completed} of ${card.progress.total} sub-issues done`}
        >
          <div className="h-1.5 w-full overflow-hidden rounded bg-neutral-200">
            <div className="h-full bg-emerald-500" style={{ width: `${card.progress.percent}%` }} />
          </div>
          <div className="mt-0.5 text-[11px] text-neutral-500">
            {card.progress.completed}/{card.progress.total}
          </div>
        </div>
      )}
    </article>
  );
}
