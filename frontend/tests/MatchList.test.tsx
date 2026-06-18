import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MatchList } from "../src/components/MatchList";
import type { Match } from "../src/api/client";

const baseMatch: Match = {
  ocid: "ocds-1",
  title: "Provision of Cloud Hosting Services for Government Departments",
  buyer: "SITA",
  procuring_entity: "SITA",
  value_zar: 12_500_000,
  value_display: "R 12,500,000",
  closing_date: "2026-07-15",
  days_to_close: 28,
  province: "Gauteng",
  category: "IT services",
  link: "https://etenders.gov.za/release/ocds-1",
  flags: ["high-value", "closing-soon"],
  matched_on: { keywords: ["cloud"], buyers: ["sita"] },
};

describe("MatchList (T14)", () => {
  it("renders all matches with no truncation", () => {
    const matches = Array.from({ length: 25 }, (_, i) => ({ ...baseMatch, ocid: `ocds-${i}` }));
    render(<MatchList matches={matches} onSelect={() => {}} />);
    expect(screen.getAllByRole("article")).toHaveLength(25);
  });

  it("shows the empty state when matches is empty", () => {
    render(<MatchList matches={[]} onSelect={() => {}} />);
    expect(screen.getByText(/no matches in this window/i)).toBeInTheDocument();
  });

  it("sorts by closing date ascending", () => {
    const matches = [
      { ...baseMatch, ocid: "ocds-late", closing_date: "2026-08-15", days_to_close: 50 },
      { ...baseMatch, ocid: "ocds-early", closing_date: "2026-06-20", days_to_close: 3 },
    ];
    render(<MatchList matches={matches} onSelect={() => {}} />);
    const articles = screen.getAllByRole("article");
    expect(articles[0]).toHaveAttribute("data-ocid", "ocds-early");
    expect(articles[1]).toHaveAttribute("data-ocid", "ocds-late");
  });
});

describe("MatchList (T15)", () => {
  it("shows the upstream banner when upstream is down", () => {
    render(
      <MatchList
        matches={[baseMatch]}
        onSelect={() => {}}
        upstreamDown={{ cachedAt: "4 minutes ago" }}
      />,
    );
    expect(screen.getByText(/unreachable/i)).toBeInTheDocument();
  });
});
