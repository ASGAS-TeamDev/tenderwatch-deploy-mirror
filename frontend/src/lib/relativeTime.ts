const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function relativeDays(target: string, now: Date = new Date()): number {
  const t = new Date(target).getTime();
  const n = now.getTime();
  return Math.round((t - n) / 86_400_000);
}

export function relativeClosingLabel(target: string, now: Date = new Date()): string {
  const days = relativeDays(target, now);
  if (days < 0) return "closed";
  if (days === 0) return "closes today";
  if (days === 1) return "closes tomorrow";
  return rtf.format(days, "day");
}

// "3 hours ago" / "2 days ago" style label for a past timestamp — used for
// the Postgres sync freshness indicator (see components/HealthChip.tsx).
export function relativeTimeAgo(target: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(target).getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return rtf.format(-diffMinutes, "minute");
  const diffHours = Math.round(diffMs / 3_600_000);
  if (diffHours < 24) return rtf.format(-diffHours, "hour");
  const diffDays = Math.round(diffMs / 86_400_000);
  return rtf.format(-diffDays, "day");
}