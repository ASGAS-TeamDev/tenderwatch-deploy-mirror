// Intl.NumberFormat("en-ZA", ZAR) uses non-breaking spaces (U+00A0) as the
// thousand separator ("R 12 500 000"), but the design spec asks for the
// conventional en-US-style commas ("R 12,500,000"). Build it manually to
// match the spec exactly.

export function formatZAR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "R —";
  return `R ${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// en-CA renders dates as YYYY-MM-DD in the given timezone (ISO-like), which
// is what the spec asks for (dashes, not slashes).
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Johannesburg",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatDateSAST(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return dateFormatter.format(new Date(iso));
  } catch {
    return "";
  }
}

// en-GB gives "17 Sep 2026, 10:00" — used where the time-of-day matters
// (e.g. a compulsory virtual briefing session), not just the date.
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Johannesburg",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDateTimeSAST(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return `${dateTimeFormatter.format(new Date(iso))} SAST`;
  } catch {
    return "";
  }
}