import { useState } from "react";
import type { Match } from "../api/client";
import { MatchList } from "./MatchList";
import { provincesWithCounts, filterByProvince } from "../lib/matchFilters";

export function RegionsView({
  matches, onSelect, upstreamDown, favouritedOcids, onToggleFavourite, onExecutiveSummary,
}: {
  matches: Match[];
  onSelect: (m: Match) => void;
  upstreamDown?: { cachedAt: string };
  favouritedOcids?: string[];
  onToggleFavourite?: (ocid: string) => void;
  onExecutiveSummary?: (match: Match) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const provinces = provincesWithCounts(matches);
  const filtered = filterByProvince(matches, selected);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <ProvinceChip label={`All (${matches.length})`} active={selected === null} onClick={() => setSelected(null)} />
        {provinces.map((p) => (
          <ProvinceChip
            key={p.province}
            label={`${p.province} (${p.count})`}
            active={selected === p.province}
            onClick={() => setSelected(p.province)}
          />
        ))}
      </div>
      <MatchList
        matches={filtered}
        onSelect={onSelect}
        upstreamDown={upstreamDown}
        favouritedOcids={favouritedOcids}
        onToggleFavourite={onToggleFavourite}
        onExecutiveSummary={onExecutiveSummary}
        emptyHeadline="No matches in this region"
        emptyBody="Pick a different province, or clear the filter to see everything."
      />
    </div>
  );
}

function ProvinceChip({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "rounded-pill px-3 py-1 text-xs font-bold tracking-wide transition",
        active
          ? "bg-primary text-on-primary"
          : "bg-secondary-container text-on-secondary-container hover:opacity-90",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
