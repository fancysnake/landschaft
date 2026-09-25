import type { DragEvent } from "react";

import type { Card } from "../types";

export interface DragPayload {
  card: Card;
  laneId: string;
  colId: string;
}

const MIME = "application/x-landschaft-card";

export function setPayload(event: DragEvent, payload: DragPayload): void {
  event.dataTransfer.setData(MIME, JSON.stringify(payload));
  event.dataTransfer.effectAllowed = "move";
}

export function hasPayload(event: DragEvent): boolean {
  return event.dataTransfer.types.includes(MIME);
}

export function readPayload(event: DragEvent): DragPayload | null {
  const raw = event.dataTransfer.getData(MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}
