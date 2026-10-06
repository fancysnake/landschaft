import type { StatusLabel } from "../../lib/schema";
import type { Card } from "../../lib/types";

import { labelStyle, repoShortName } from "../../lib/client/labels";

const STATUS_PILLS: Record<StatusLabel, { text: string; title: string; className: string }> = {
  "is:conflicting": {
    text: "conflict",
    title: "Merge conflict",
    className: "bg-red-100 text-red-800",
  },
  "is:ci:failed": { text: "CI ✗", title: "CI failed", className: "bg-red-100 text-red-800" },
  "is:ci:running": {
    text: "CI …",
    title: "CI running",
    className: "bg-amber-100 text-amber-800",
  },
  "is:unanswered": {
    text: "comments",
    title: "Unanswered review comments",
    className: "bg-orange-100 text-orange-800",
  },
  "is:has-pr": {
    text: "PR open",
    title: "An open PR closes it",
    className: "bg-sky-100 text-sky-800",
  },
};

interface Props {
  card: Card;
  showRepo: boolean;
}

export function IssueCard({ card, showRepo }: Props) {
  return (
    <article
      className={`rounded-md border border-l-4 p-2 text-sm shadow-xs ${
        card.blocked
          ? "border-red-300 border-l-red-500 bg-red-50"
          : card.isEpic
            ? "border-violet-300 border-l-violet-500 bg-violet-50"
            : card.kind === "pr"
              ? "border-sky-300 border-l-sky-500 bg-sky-50"
              : "border-neutral-200 border-l-emerald-500 bg-white"
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
        <span className="font-mono">
          {showRepo ? `${repoShortName(card.repo)}#` : "#"}
          {card.number}
        </span>
        {card.kind === "pr" && <span className="rounded bg-sky-100 px-1 text-sky-800">PR</span>}
        {card.isEpic && <span className="rounded bg-violet-100 px-1 text-violet-800">epic</span>}
        {card.blocked && <span className="rounded bg-red-100 px-1 text-red-800">blocked</span>}
        {card.statuses.map((status) => (
          <span
            key={status}
            title={STATUS_PILLS[status].title}
            className={`rounded px-1 ${STATUS_PILLS[status].className}`}
          >
            {STATUS_PILLS[status].text}
          </span>
        ))}
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
