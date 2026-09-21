import { useEffect, useMemo, useState } from "react";
import type { Match } from "../api/client";
import { groupBriefingsByDate } from "../lib/matchFilters";
import { formatDateTimeSAST } from "../lib/format";
import { EmptyState } from "./EmptyState";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABEL = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

// Worst-case flag among a day's briefings decides the cell's colour —
// a compulsory session outranks a merely-scheduled one.
function daySeverity(matches: Match[]): "required" | "scheduled" | "missed" {
  if (matches.some((m) => m.flags.includes("briefing-required"))) return "required";
  if (matches.some((m) => m.flags.includes("briefing-scheduled"))) return "scheduled";
  return "missed";
}

const severityDot: Record<ReturnType<typeof daySeverity>, string> = {
  required: "bg-error",
  scheduled: "bg-tertiary",
  missed: "bg-on-surface-variant",
};

export function BriefingsCalendar({
  matches, onSelect,
}: {
  matches: Match[];
  onSelect: (m: Match) => void;
}) {
  const byDate = useMemo(() => groupBriefingsByDate(matches), [matches]);

  const now = new Date();
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const [cursor, setCursor] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() }));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Land on today if it has briefings, otherwise the nearest upcoming date
  // with one — but only on first load, so the user's own clicks stick.
  useEffect(() => {
    if (selectedDate !== null || byDate.size === 0) return;
    const dates = [...byDate.keys()].sort();
    const next = dates.find((d) => d >= todayKey) ?? dates[dates.length - 1];
    setSelectedDate(next);
    const [y, m] = next.split("-").map(Number);
    setCursor({ year: y, month: m - 1 });
  }, [byDate, selectedDate, todayKey]);

  if (byDate.size === 0) {
    return (
      <EmptyState
        headline="No briefing sessions in this window"
        body="Compulsory and scheduled briefing sessions from matched tenders will show up here."
      />
    );
  }

  const firstOfMonth = new Date(cursor.year, cursor.month, 1);
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();
  const cells: Array<{ day: number; key: string } | null> = [
    ...Array<null>(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, key: dateKey(cursor.year, cursor.month, i + 1) })),
  ];

  const selectedMatches = selectedDate ? byDate.get(selectedDate) ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-on-surface-variant/30 bg-surface p-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setCursor(({ year, month }) => (month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }))}
            className="rounded-pill border border-on-surface-variant/30 px-2 py-1 text-sm font-semibold text-on-surface hover:bg-surface-variant"
          >
            ← Prev
          </button>
          <h3 className="text-sm font-bold tracking-wide text-on-surface" style={{ fontFamily: "Michroma, sans-serif" }}>
            {MONTH_LABEL.format(firstOfMonth)}
          </h3>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setCursor(({ year, month }) => (month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }))}
            className="rounded-pill border border-on-surface-variant/30 px-2 py-1 text-sm font-semibold text-on-surface hover:bg-surface-variant"
          >
            Next →
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 border-b-2 border-on-surface-variant/30 pb-2 text-center text-[11px] font-bold uppercase tracking-wider text-on-surface">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-px overflow-hidden rounded-card border border-on-surface-variant/30 bg-on-surface-variant/30">
          {cells.map((cell, i) => {
            if (!cell) return <div key={`blank-${i}`} className="aspect-square bg-surface-variant/60" />;
            const dayMatches = byDate.get(cell.key) ?? [];
            const isToday = cell.key === todayKey;
            const isSelected = cell.key === selectedDate;
            const hasBriefings = dayMatches.length > 0;
            return (
              <button
                key={cell.key}
                type="button"
                disabled={!hasBriefings}
                onClick={() => setSelectedDate(cell.key)}
                className={[
                  "relative flex aspect-square flex-col items-center justify-center gap-0.5 text-xs transition",
                  isSelected
                    ? "bg-primary text-on-primary font-bold"
                    : hasBriefings
                      ? "bg-surface-variant text-on-surface font-semibold hover:bg-primary-container cursor-pointer"
                      : "bg-surface text-on-surface-variant",
                  isToday && !isSelected ? "ring-2 ring-inset ring-primary" : "",
                ].join(" ")}
              >
                <span className={isToday && !isSelected ? "font-bold text-primary" : ""}>{cell.day}</span>
                {hasBriefings && (
                  <span className="flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full border border-surface ${isSelected ? "bg-on-primary" : severityDot[daySeverity(dayMatches)]}`} />
                    <span className="text-[10px] font-bold">{dayMatches.length}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[11px] font-semibold text-on-surface-variant">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-error" /> Compulsory</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-tertiary" /> Scheduled</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-on-surface-variant" /> Passed</span>
      </div>

      {selectedDate && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            {selectedMatches.length > 0
              ? `Briefings on ${selectedDate}`
              : `No briefings on ${selectedDate}`}
          </h4>
          {selectedMatches.map((m) => (
            <button
              key={m.ocid}
              type="button"
              onClick={() => onSelect(m)}
              className="block w-full rounded-card border border-on-surface-variant/30 bg-surface p-3 text-left transition hover:border-primary hover:bg-primary-container"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-on-surface">{m.title}</p>
                <span
                  className={[
                    "shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    m.briefing_session?.compulsory
                      ? "bg-error-container text-on-error-container"
                      : "bg-tertiary-container text-on-tertiary-container",
                  ].join(" ")}
                >
                  {m.briefing_session?.compulsory ? "Compulsory" : "Optional"}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant">{m.buyer}</p>
              <p className="mt-1 text-xs text-on-surface">
                {m.briefing_session?.date ? formatDateTimeSAST(m.briefing_session.date) : ""}
              </p>
              {m.briefing_session?.venue && m.briefing_session.venue !== "N/A" && (
                <p className="text-xs text-on-surface-variant">{m.briefing_session.venue}</p>
              )}
              <p className="mt-1 text-[11px] font-bold text-primary">View tender →</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
