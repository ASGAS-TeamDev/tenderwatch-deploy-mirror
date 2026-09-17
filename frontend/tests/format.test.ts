import { describe, it, expect } from "vitest";
import { formatZAR, formatDateSAST } from "../src/lib/format";

describe("formatZAR", () => {
  it("formats whole numbers with thousand separators", () => {
    expect(formatZAR(12_500_000)).toBe("R 12,500,000");
  });
  it("handles null as a dash", () => {
    expect(formatZAR(null)).toBe("R —");
  });
  it("handles zero", () => {
    expect(formatZAR(0)).toBe("R 0");
  });
});

describe("formatDateSAST", () => {
  it("renders an ISO date in Africa/Johannesburg", () => {
    expect(formatDateSAST("2026-07-15T17:00:00Z")).toBe("2026-07-15");
  });
  it("returns empty string for null", () => {
    expect(formatDateSAST(null)).toBe("");
  });
});