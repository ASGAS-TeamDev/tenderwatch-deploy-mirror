type Flag = "high-value" | "closing-soon" | "closed";

const palette: Record<Flag, { bg: string; fg: string; label: (m: { value_display?: string; days_to_close?: number | null }) => string }> = {
  "high-value": {
    bg: "bg-tertiary-container",
    fg: "text-on-tertiary-container",
    label: (m) => `HIGH-VALUE ${m.value_display ?? ""}`.trim(),
  },
  "closing-soon": {
    bg: "bg-warning-container",
    fg: "text-on-warning-container",
    label: (m) => `CLOSES IN ${m.days_to_close ?? 0} DAYS`,
  },
  "closed": {
    bg: "bg-surface-variant",
    fg: "text-on-surface-variant",
    label: () => "CLOSED",
  },
};

export function FlagPill({
  flag, match,
}: { flag: Flag; match: { value_display?: string; days_to_close?: number | null } }) {
  const p = palette[flag];
  return (
    <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${p.bg} ${p.fg}`}>
      {p.label(match)}
    </span>
  );
}
