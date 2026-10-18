import type { StatusLabel } from "../../lib/status";
import type { Card, CiJobCard, IssueItemCard } from "../../lib/types";

import { labelStyle, relativeTime, repoShortName } from "../../lib/client/labels";

const RED = "bg-red-50 text-red-700 ring-red-200";
const SKY = "bg-sky-50 text-sky-700 ring-sky-200";

const STATUS_PILLS: Record<StatusLabel, { text: string; title: string; className: string }> = {
  "is:conflicting": { text: "conflict", title: "Merge conflict", className: RED },
  "is:ci:failed": { text: "CI ✗", title: "CI failed", className: RED },
  "is:ci:running": {
    text: "CI …",
    title: "CI running",
    className: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  "is:unanswered": {
    text: "comments",
    title: "Unanswered review comments",
    className: "bg-orange-50 text-orange-700 ring-orange-200",
  },
  "is:has-pr": { text: "PR open", title: "An open PR closes it", className: SKY },
};

/** White card with a coloured bar on the left for its kind. */
const cardClass = (accent: string) =>
  `rounded-lg border border-neutral-200 border-l-[3px] bg-white px-3 py-2 text-sm shadow-xs transition-shadow hover:shadow-md ${accent}`;

const meta = "mb-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500";

const title = "leading-snug font-medium text-neutral-900 hover:underline";

function CiJobItem({ card, showRepo }: { card: CiJobCard; showRepo: boolean }) {
  return (
    <article className={cardClass("border-l-orange-500")}>
      <div className={meta}>
        <span className={`pill ${RED}`}>CI ✗</span>
        <span className="font-mono text-[11px]">
          {showRepo && `${repoShortName(card.repo)}:`}
          {card.branch}
        </span>
        {card.pr && (
          <a
            href={card.pr.url}
            target="_blank"
            rel="noreferrer"
            className={`pill ${SKY} hover:underline`}
          >
            PR #{card.pr.number}
          </a>
        )}
        <span className="ml-auto tabular-nums" title={card.failedAt}>
          failed {relativeTime(card.failedAt)}
        </span>
      </div>
      <a href={card.url} target="_blank" rel="noreferrer" className={title}>
        {card.workflow ? `${card.workflow} / ${card.name}` : card.name}
      </a>
    </article>
  );
}

/** `card` as its kind shows. */
export function CardView({ card, showRepo }: { card: Card; showRepo: boolean }) {
  return card.kind === "ci-job" ? (
    <CiJobItem card={card} showRepo={showRepo} />
  ) : (
    <IssueCard card={card} showRepo={showRepo} />
  );
}

function IssueCard({ card, showRepo }: { card: IssueItemCard; showRepo: boolean }) {
  return (
    <article
      className={cardClass(
        card.blocked
          ? "border-l-red-500"
          : card.isEpic
            ? "border-l-violet-500"
            : card.kind === "pr"
              ? "border-l-sky-500"
              : "border-l-emerald-500",
      )}
    >
      <div className={meta}>
        <span className="font-mono text-[11px]">
          {showRepo ? `${repoShortName(card.repo)}#` : "#"}
          {card.number}
        </span>
        {card.kind === "pr" && <span className={`pill ${SKY}`}>PR</span>}
        {card.isEpic && (
          <span className="pill bg-violet-50 text-violet-700 ring-violet-200">epic</span>
        )}
        {card.blocked && <span className={`pill ${RED}`}>blocked</span>}
        {card.statuses.map((status) => (
          <span
            key={status}
            title={STATUS_PILLS[status].title}
            className={`pill ${STATUS_PILLS[status].className}`}
          >
            {STATUS_PILLS[status].text}
          </span>
        ))}
        {card.assignees.length > 0 && (
          <span className="ml-auto flex -space-x-1.5">
            {card.assignees.map((assignee) => (
              <img
                key={assignee.login}
                src={assignee.avatarUrl}
                alt={assignee.login}
                title={assignee.login}
                className="h-5 w-5 rounded-full bg-neutral-200 ring-2 ring-white"
              />
            ))}
          </span>
        )}
      </div>
      <a href={card.url} target="_blank" rel="noreferrer" className={title}>
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
          className="mt-2 flex items-center gap-2"
          title={`${card.progress.completed} of ${card.progress.total} sub-issues done`}
        >
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${card.progress.percent}%` }}
            />
          </div>
          <span className="text-[11px] text-neutral-500 tabular-nums">
            {card.progress.completed}/{card.progress.total}
          </span>
        </div>
      )}
    </article>
  );
}
