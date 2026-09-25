import { type DragEvent, useState } from "react";

import type { Card } from "../../lib/types";

import { type DragPayload, hasPayload, readPayload } from "../../lib/client/dnd";
import { IssueCard } from "./IssueCard";

interface Props {
  laneId: string;
  colId: string;
  cards: Card[];
  showRepo: boolean;
  dragging: DragPayload | null;
  onDragStart(payload: DragPayload): void;
  onDragEnd(): void;
  onDrop(payload: DragPayload): void;
}

export function Cell({
  laneId,
  colId,
  cards,
  showRepo,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop,
}: Props) {
  const [over, setOver] = useState(false);
  const isSource = dragging?.laneId === laneId && dragging.colId === colId;
  const canDrop = dragging !== null && !isSource;

  const dragOver = (event: DragEvent) => {
    if (!hasPayload(event) || isSource) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setOver(true);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const payload = readPayload(event);
    if (payload && !(payload.laneId === laneId && payload.colId === colId)) onDrop(payload);
  };

  return (
    <div
      onDragOver={dragOver}
      onDragEnter={dragOver}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={`flex min-h-16 flex-col gap-2 rounded-md border p-2 transition-colors ${
        over
          ? "border-sky-400 bg-sky-50"
          : canDrop
            ? "border-dashed border-neutral-300 bg-neutral-50"
            : "border-transparent bg-neutral-100/60"
      }`}
    >
      {cards.map((card) => (
        <IssueCard
          key={card.key}
          card={card}
          laneId={laneId}
          colId={colId}
          showRepo={showRepo}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  );
}
