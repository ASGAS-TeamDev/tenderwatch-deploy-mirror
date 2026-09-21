import { formatDateTimeSAST } from "../lib/format";

type Flag = "high-value" | "closing-soon" | "closed" | "briefing-required" | "briefing-scheduled" | "briefing-missed";

interface FlagMatch {
  value_display?: string;
  days_to_close?: number | null;
  briefing_session?: { date: string; venue: string } | null;
}

const palette: Record<Flag, { bg: string; fg: string; label: (m: FlagMatch) => string }> = {
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
  "briefing-required": {
    bg: "bg-error-container",
    fg: "text-on-error-container",
    label: (m) => {
      const when = m.briefing_session?.date ? formatDateTimeSAST(m.briefing_session.date) : "";
      return `COMPULSORY BRIEFING${when ? ` — ${when}` : ""}`;
    },
  },
  "briefing-scheduled": {
    bg: "bg-tertiary-container",
    fg: "text-on-tertiary-container",
    label: (m) => {
      const when = m.briefing_session?.date ? formatDateTimeSAST(m.briefing_session.date) : "";
      return `BRIEFING SESSION${when ? ` — ${when}` : ""}`;
    },
  },
  "briefing-missed": {
    bg: "bg-error",
    fg: "text-on-error",
    label: () => "BRIEFING SESSION HAS PASSED — CHECK ELIGIBILITY",
  },
};

export function FlagPill({
  flag, match,
}: { flag: Flag; match: FlagMatch }) {
  const p = palette[flag];
  return (
    <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${p.bg} ${p.fg}`}>
      {p.label(match)}
    </span>
  );
}
