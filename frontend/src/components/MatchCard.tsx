import type { Match } from "../api/client";
import { FlagPill } from "./FlagPill";
import { relativeClosingLabel } from "../lib/relativeTime";
import { formatDateTimeSAST } from "../lib/format";

export function MatchCard({
  match, onClick, isFavourite = false, onToggleFavourite, onExecutiveSummary,
}: {
  match: Match;
  onClick: () => void;
  isFavourite?: boolean;
  onToggleFavourite?: (ocid: string) => void;
  onExecutiveSummary?: (match: Match) => void;
}) {
  // Cancelled tenders are normally hard-filtered server-side before they
  // ever reach the frontend (see filter.py), but this stays defensive in
  // case that ever loosens. "closed" (past the closing date) does reach
  // the frontend whenever include_closed is on.
  const isInactive = match.status.toLowerCase() === "cancelled" || match.flags.includes("closed");

  const urgencyBorder =
    match.days_to_close == null
      ? "border-success"
      : match.days_to_close <= 3
        ? "border-error"
        : match.days_to_close <= 7
          ? "border-warning"
          : "border-success";

  return (
    <article
      data-ocid={match.ocid}
      onClick={isInactive ? undefined : onClick}
      className={[
        "rounded-card border p-4 transition",
        isInactive
          ? "border-error bg-error/40"
          : `${urgencyBorder} bg-surface cursor-pointer hover:border-primary`,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {match.flags.map((f) => (
            <FlagPill key={f} flag={f} match={match} />
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExecutiveSummary?.(match);
            }}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Executive Summary
          </button>
          {onToggleFavourite && (
            <button
              type="button"
              aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
              aria-pressed={isFavourite}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavourite(match.ocid);
              }}
              className={isFavourite ? "text-lg leading-none text-tertiary" : "text-lg leading-none text-on-surface-variant/50 hover:text-tertiary"}
            >
              {isFavourite ? "★" : "☆"}
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold tracking-wide text-black" style={{ fontFamily: "Michroma, sans-serif" }}>
          {match.title}
        </h3>
        {match.heading && (
          <span className="shrink-0 text-right text-xs font-semibold text-on-surface-variant">
            {match.heading}
          </span>
        )}
      </div>
      <p className="text-xs font-bold text-black">{match.buyer}</p>
      {match.description && (
        <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">
          {match.description}
        </p>
      )}
      <p className="mt-1 text-xs text-on-surface-variant">
        {match.province ?? "—"} · Category: {match.category ?? "—"}
      </p>
      <p className="mt-1 text-xs text-on-surface-variant">
        Closes {match.closing_date} ({relativeClosingLabel(match.closing_date)})
      </p>
      {match.briefing_session?.has_session && (
        <p className={`mt-1 text-xs font-bold ${match.briefing_session.compulsory ? "text-error" : "text-tertiary"}`}>
          ⚠ {match.briefing_session.compulsory ? "Compulsory briefing" : "Briefing session"}
          {match.briefing_session.date ? ` — ${formatDateTimeSAST(match.briefing_session.date)}` : ""}
          {match.briefing_session.venue && match.briefing_session.venue !== "N/A"
            ? ` (${match.briefing_session.venue})`
            : ""}
        </p>
      )}
      <p className="mt-2 text-[11px] text-on-surface-variant">
        {match.matched_on.keywords.length || match.matched_on.buyers.length
          ? `Matched on: ${match.matched_on.keywords.concat(match.matched_on.buyers).join(", ")}`
          : "Shown via \"show all\" — no keyword/buyer match"}
      </p>
    </article>
  );
}
