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