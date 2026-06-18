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
      <h3 className="mt-2 text-base font-bold text-on-surface">{match.title}</h3>
      <p className="mt-1 text-xs text-on-surface-variant">
        {match.buyer} · {match.province ?? "—"} · Category: {match.category ?? "—"}
      </p>
      <p className="mt-1 text-xs text-on-surface-variant">
        Closes {match.closing_date} ({relativeClosingLabel(match.closing_date)}) ·{" "}
        <a
          href={match.link}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-primary underline"
        >
          View on eTenders →
        </a>
      </p>
      <p className="mt-2 text-[11px] text-on-surface-variant">
        Matched on: {match.matched_on.keywords.concat(match.matched_on.buyers).join(", ")}
      </p>
    </article>
  );
}
