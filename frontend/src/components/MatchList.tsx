import type { Match } from "../api/client";
import { MatchCard } from "./MatchCard";
import { UpstreamBanner } from "./UpstreamBanner";
import { EmptyState } from "./EmptyState";

export function MatchList({
  matches, onSelect, upstreamDown, favouritedOcids, onToggleFavourite, onExecutiveSummary, emptyHeadline, emptyBody,
}: {
  matches: Match[];
  onSelect: (m: Match) => void;
  upstreamDown?: { cachedAt: string };
  favouritedOcids?: string[];
  onToggleFavourite?: (ocid: string) => void;
  onExecutiveSummary?: (match: Match) => void;
  emptyHeadline?: string;
  emptyBody?: string;
}) {
  if (matches.length === 0) {
    return (
      <div className="space-y-4">
        {upstreamDown && <UpstreamBanner cachedAt={upstreamDown.cachedAt} onRetry={() => window.location.reload()} />}
        <EmptyState
          headline={emptyHeadline ?? "No matches in this window"}
          body={emptyBody ?? "Try a longer look-back, or relax the filters."}
        />
      </div>
    );
  }
  const favSet = new Set(favouritedOcids ?? []);
  const sorted = [...matches].sort((a, b) => a.closing_date.localeCompare(b.closing_date));
  return (
    <div className="space-y-4">
      {upstreamDown && <UpstreamBanner cachedAt={upstreamDown.cachedAt} onRetry={() => window.location.reload()} />}
      <div className="grid gap-4">
        {sorted.map((m) => (
          <MatchCard
            key={m.ocid}
            match={m}
            onClick={() => onSelect(m)}
            isFavourite={favSet.has(m.ocid)}
            onToggleFavourite={onToggleFavourite}
            onExecutiveSummary={onExecutiveSummary}
          />
        ))}
      </div>
    </div>
  );
}
