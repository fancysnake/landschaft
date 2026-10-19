import type { PullStatusLabel } from "../../lib/status";
import type { Card, CiJobCard, IssueItemCard, LabelRef } from "../../lib/types";

import { labelStyle, relativeTime, repoShortName } from "../../lib/client/labels";
import { ProgressBar } from "./ProgressBar";
import { TONE, type Tone } from "./tone";

const STATUS_PILLS: Record<PullStatusLabel, { text: string; title: string; tone: Tone }> = {
  "is:conflicting": { text: "conflict", title: "Merge conflict", tone: "red" },
  "is:ci:failed": { text: "CI ✗", title: "CI failed", tone: "red" },
  "is:ci:running": { text: "CI …", title: "CI running", tone: "amber" },
  "is:unanswered": { text: "comments", title: "Unanswered review comments", tone: "orange" },
};

/** Card with a coloured bar on the left for its kind; white unless `surface` tints it. */
const cardClass = (accent: string, surface = "border-neutral-200 bg-white") =>
  `rounded-lg border border-l-[3px] px-3 py-2 text-sm shadow-xs ${surface} ${accent}`;

const metaRow = "mb-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500";

const titleLink = "leading-snug font-medium text-neutral-900 hover:underline";

function Labels({ labels }: { labels: LabelRef[] }) {
  return (
    labels.length > 0 && (
      <div className="mt-1.5 flex flex-wrap gap-1">
        {labels.map((label) => (
          <span
            key={label.name}
            style={labelStyle(label.color)}
            className="rounded-full px-1.5 text-[0.6875rem] leading-4"
          >
            {label.name}
          </span>
        ))}
      </div>
    )
  );
}

function CiJobItem({ card, showRepo }: { card: CiJobCard; showRepo: boolean }) {
  return (
    <article className={cardClass("border-l-orange-500")}>
      <div className={metaRow}>
        <span className={`pill ${TONE.red}`}>CI ✗</span>
        <span className="font-mono text-[0.6875rem]">
          {showRepo && `${repoShortName(card.repo)}:`}
          {card.branch}
        </span>
        {card.pr && (
          <a
            href={card.pr.url}
            target="_blank"
            rel="noreferrer"
            className={`pill ${TONE.sky} hover:underline`}
          >
            PR #{card.pr.number}
          </a>
        )}
        <span className="ml-auto tabular-nums" title={card.failedAt}>
          failed {relativeTime(card.failedAt)}
        </span>
      </div>
      <a href={card.url} target="_blank" rel="noreferrer" className={titleLink}>
        {card.workflow ? `${card.workflow} / ${card.name}` : card.name}
      </a>
      <Labels labels={card.labels} />
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
  const closed = card.state === "CLOSED";
  return (
    <article
      className={
        closed
          ? cardClass("border-l-neutral-400", "border-neutral-200 bg-neutral-50 opacity-70")
          : card.blocked
            ? cardClass("border-l-red-500", "border-red-200 bg-red-50/60")
            : cardClass(
                card.isEpic
                  ? "border-l-violet-500"
                  : card.kind === "pr"
                    ? "border-l-sky-500"
                    : "border-l-emerald-500",
              )
      }
    >
      <div className={metaRow}>
        <span className="font-mono text-[0.6875rem]">
          {showRepo ? `${repoShortName(card.repo)}#` : "#"}
          {card.number}
        </span>
        {card.kind === "pr" && <span className={`pill ${TONE.sky}`}>PR</span>}
        {card.isEpic && <span className={`pill ${TONE.violet}`}>epic</span>}
        {closed && <span className={`pill ${TONE.neutral}`}>closed</span>}
        {card.blocked && <span className={`pill ${TONE.red}`}>blocked</span>}
        {/* Statuses refresh for open PRs only, so a closed one's are stale. */}
        {!closed &&
          card.statuses.map((status) => (
            <span
              key={status}
              title={STATUS_PILLS[status].title}
              className={`pill ${TONE[STATUS_PILLS[status].tone]}`}
            >
              {STATUS_PILLS[status].text}
            </span>
          ))}
        {card.hasPr && (
          <span title="An open PR closes it" className={`pill ${TONE.sky}`}>
            PR open
          </span>
        )}
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
      <a href={card.url} target="_blank" rel="noreferrer" className={titleLink}>
        {card.title}
      </a>
      <Labels labels={card.labels} />
      {card.progress && (
        <div
          className="mt-2 flex items-center gap-2"
          title={`${card.progress.completed} of ${card.progress.total} sub-issues done`}
        >
          <ProgressBar percent={card.progress.percent} />
          <span className="text-[0.6875rem] text-neutral-500 tabular-nums">
            {card.progress.completed}/{card.progress.total}
          </span>
        </div>
      )}
    </article>
  );
}
