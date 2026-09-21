import { describe, it, expect } from "vitest";
import { relativeDays, relativeClosingLabel, relativeTimeAgo } from "../src/lib/relativeTime";

describe("relativeDays", () => {
  it("returns positive days for future", () => {
    const now = new Date("2026-06-17T00:00:00Z");
    expect(relativeDays("2026-06-19T00:00:00Z", now)).toBe(2);
  });
  it("returns negative days for past", () => {
    const now = new Date("2026-06-17T00:00:00Z");
    expect(relativeDays("2026-06-15T00:00:00Z", now)).toBe(-2);
  });
});

describe("relativeClosingLabel", () => {
  it("returns 'in N days' for future", () => {
    const now = new Date("2026-06-17T00:00:00Z");
    expect(relativeClosingLabel("2026-06-19T00:00:00Z", now)).toBe("in 2 days");
  });
  it("returns 'closed' for past", () => {
    const now = new Date("2026-06-17T00:00:00Z");
    expect(relativeClosingLabel("2026-06-15T00:00:00Z", now)).toBe("closed");
  });
});

describe("relativeTimeAgo", () => {
  const now = new Date("2026-06-17T12:00:00Z");

  it("returns 'just now' for under a minute", () => {
    expect(relativeTimeAgo("2026-06-17T11:59:45Z", now)).toBe("just now");
  });

  it("formats minutes ago", () => {
    expect(relativeTimeAgo("2026-06-17T11:45:00Z", now)).toBe("15 minutes ago");
  });

  it("formats hours ago", () => {
    expect(relativeTimeAgo("2026-06-17T09:00:00Z", now)).toBe("3 hours ago");
  });

  it("formats days ago", () => {
    expect(relativeTimeAgo("2026-06-15T12:00:00Z", now)).toBe("2 days ago");
  });
});