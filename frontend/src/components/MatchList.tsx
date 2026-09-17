import type { Match } from "../api/client";
import { MatchCard } from "./MatchCard";
import { UpstreamBanner } from "./UpstreamBanner";
import { EmptyState } from "./EmptyState";

export function MatchList({
  matches, onSelect, upstreamDown,
}: {
  matches: Match[];
  onSelect: (m: Match) => void;
  upstreamDown?: { cachedAt: string };
}) {
  if (matches.length === 0) {
    return (
      <div className="space-y-4">
        {upstreamDown && <UpstreamBanner cachedAt={upstreamDown.cachedAt} onRetry={() => window.location.reload()} />}
        <EmptyState
          headline="No matches in this window"
          body="Try a longer look-back, or relax the filters."
        />
      </div>
    );
  }
  const sorted = [...matches].sort((a, b) => a.closing_date.localeCompare(b.closing_date));
  return (
    <div className="space-y-4">
      {upstreamDown && <UpstreamBanner cachedAt={upstreamDown.cachedAt} onRetry={() => window.location.reload()} />}
      <div className="grid gap-4">
        {sorted.map((m) => (
          <MatchCard key={m.ocid} match={m} onClick={() => onSelect(m)} />
        ))}
      </div>
    </div>
  );
}
