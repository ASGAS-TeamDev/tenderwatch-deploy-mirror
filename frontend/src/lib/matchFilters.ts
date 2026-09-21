import type { Match } from "../api/client";
import { relativeDays } from "./relativeTime";
import { formatDateSAST } from "./format";

export function publishedWithinDays(matches: Match[], days: number, now: Date = new Date()): Match[] {
  return matches.filter((m) => {
    if (!m.published_date) return false;
    const d = relativeDays(m.published_date, now);
    return d <= 0 && d >= -days;
  });
}

export function closingWithinDays(matches: Match[], days: number): Match[] {
  return matches.filter((m) => m.days_to_close !== null && m.days_to_close >= 0 && m.days_to_close <= days);
}

export function favouriteMatches(matches: Match[], favouritedOcids: string[]): Match[] {
  const set = new Set(favouritedOcids);
  return matches.filter((m) => set.has(m.ocid));
}

export interface ProvinceCount {
  province: string;
  count: number;
}

export function provincesWithCounts(matches: Match[]): ProvinceCount[] {
  const counts = new Map<string, number>();
  for (const m of matches) {
    const key = m.province ?? "Unspecified";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([province, count]) => ({ province, count }))
    .sort((a, b) => a.province.localeCompare(b.province));
}

export function filterByProvince(matches: Match[], province: string | null): Match[] {
  if (province === null) return matches;
  return matches.filter((m) => (m.province ?? "Unspecified") === province);
}

export function matchesWithBriefings(matches: Match[]): Match[] {
  return matches.filter((m) => m.briefing_session?.has_session && !!m.briefing_session.date);
}

// Free-text search across the fields a user is likely to recognise a tender
// by — title, buyer/procuring entity, and description. Case-insensitive
// substring match; an empty/whitespace query is a no-op (returns all).
export function searchMatches(matches: Match[], query: string): Match[] {
  const q = query.trim().toLowerCase();
  if (!q) return matches;
  return matches.filter((m) =>
    m.title.toLowerCase().includes(q) ||
    m.buyer.toLowerCase().includes(q) ||
    m.procuring_entity.toLowerCase().includes(q) ||
    m.description.toLowerCase().includes(q),
  );
}

// Groups briefing sessions by their calendar date in SAST (Africa/Johannesburg),
// keyed "YYYY-MM-DD" — matches the format lib/format.ts's formatDateSAST
// produces, so calendar grid cells can look a date straight up. Each day's
// matches are sorted by briefing time.
export function groupBriefingsByDate(matches: Match[]): Map<string, Match[]> {
  const map = new Map<string, Match[]>();
  for (const m of matchesWithBriefings(matches)) {
    const key = formatDateSAST(m.briefing_session!.date);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(m);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.briefing_session!.date.localeCompare(b.briefing_session!.date));
  }
  return map;
}
