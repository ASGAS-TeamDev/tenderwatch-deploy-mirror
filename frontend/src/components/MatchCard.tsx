import type { Match } from "../api/client";
import { FlagPill } from "./FlagPill";
import { relativeClosingLabel } from "../lib/relativeTime";

export function MatchCard({
  match, onClick,
}: { match: Match; onClick: () => void }) {
  return (
    <article
      data-ocid={match.ocid}
      onClick={onClick}
      className="cursor-pointer rounded-card border border-outline bg-surface p-4 transition hover:border-primary"
    >
      <div className="flex flex-wrap gap-2">
        {match.flags.map((f) => (
          <FlagPill key={f} flag={f} match={match} />
        ))}
      </div>
      <h3 className="mt-2 text-sm font-bold tracking-wide text-on-surface" style={{ fontFamily: "Michroma, sans-serif" }}>{match.title}</h3>
      {match.description && (
        <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">
          {match.description}
        </p>
      )}
      <p className="mt-1 text-xs text-on-surface-variant">
        {match.buyer} · {match.province ?? "—"} · Category: {match.category ?? "—"}
      </p>
      <p className="mt-1 text-xs text-on-surface-variant">
        Closes {match.closing_date} ({relativeClosingLabel(match.closing_date)})
      </p>
      <p className="mt-2 text-[11px] text-on-surface-variant">
        Matched on: {match.matched_on.keywords.concat(match.matched_on.buyers).join(", ")}
      </p>
    </article>
  );
}
