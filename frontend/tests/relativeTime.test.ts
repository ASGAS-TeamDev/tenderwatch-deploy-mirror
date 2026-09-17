import { describe, it, expect } from "vitest";
import { relativeDays, relativeClosingLabel } from "../src/lib/relativeTime";

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