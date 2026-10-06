import type { Card } from "../../lib/types";

import { IssueCard } from "./IssueCard";

interface Props {
  cards: Card[];
  showRepo: boolean;
}

export function Cell({ cards, showRepo }: Props) {
  return (
    <div className="flex min-h-16 flex-col gap-2 rounded-md bg-neutral-100/60 p-2">
      {cards.map((card) => (
        <IssueCard key={card.key} card={card} showRepo={showRepo} />
      ))}
    </div>
  );
}
