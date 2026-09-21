import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  link: "https://www.etenders.gov.za/Home/opportunities?id=1",
  flags: ["high-value", "closing-soon"],
  matched_on: { keywords: ["cloud"], buyers: ["sita"] },
  description: "Provision of cloud hosting and managed infrastructure services.",
  status: "active",
  procurement_method: "Open Tender",
  delivery_location: "",
  special_conditions: "",
  contact_person: null,
  briefing_session: null,
  documents: [],
  published_date: "",
  tender_start_date: "",
  heading: "",
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

describe("MatchList favourites", () => {
  it("shows an unfilled star by default and a filled one when favourited", () => {
    render(<MatchList matches={[baseMatch]} onSelect={() => {}} favouritedOcids={[]} onToggleFavourite={() => {}} />);
    expect(screen.getByRole("button", { name: /add to favourites/i })).toBeInTheDocument();

    render(<MatchList matches={[baseMatch]} onSelect={() => {}} favouritedOcids={["ocds-1"]} onToggleFavourite={() => {}} />);
    expect(screen.getByRole("button", { name: /remove from favourites/i })).toBeInTheDocument();
  });

  it("toggles favourite without opening the detail drawer", async () => {
    const onToggleFavourite = vi.fn();
    const onSelect = vi.fn();
    render(<MatchList matches={[baseMatch]} onSelect={onSelect} favouritedOcids={[]} onToggleFavourite={onToggleFavourite} />);
    await userEvent.click(screen.getByRole("button", { name: /add to favourites/i }));
    expect(onToggleFavourite).toHaveBeenCalledWith("ocds-1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not render a star toggle when onToggleFavourite is omitted", () => {
    render(<MatchList matches={[baseMatch]} onSelect={() => {}} />);
    expect(screen.queryByRole("button", { name: /favourites/i })).not.toBeInTheDocument();
  });
});

describe("MatchList empty-state overrides", () => {
  it("uses custom empty-state copy when provided", () => {
    render(
      <MatchList
        matches={[]}
        onSelect={() => {}}
        emptyHeadline="No favourites yet"
        emptyBody="Star a tender from any list to pin it here."
      />,
    );
    expect(screen.getByText("No favourites yet")).toBeInTheDocument();
    expect(screen.getByText(/star a tender from any list/i)).toBeInTheDocument();
  });
});
