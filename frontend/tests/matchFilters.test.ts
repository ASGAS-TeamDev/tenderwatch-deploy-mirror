import { describe, it, expect } from "vitest";
import {
  publishedWithinDays, closingWithinDays, favouriteMatches, provincesWithCounts, filterByProvince,
  matchesWithBriefings, groupBriefingsByDate,
} from "../src/lib/matchFilters";
import type { Match } from "../src/api/client";

const baseMatch: Match = {
  ocid: "ocds-1",
  title: "Provision of Cloud Hosting Services",
  buyer: "SITA",
  procuring_entity: "SITA",
  value_zar: 12_500_000,
  value_display: "R 12,500,000",
  closing_date: "2026-07-15",
  days_to_close: 28,
  province: "Gauteng",
  category: "IT services",
  link: "https://www.etenders.gov.za/Home/opportunities?id=1",
  flags: [],
  matched_on: { keywords: ["cloud"], buyers: ["sita"] },
  description: "",
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

describe("publishedWithinDays", () => {
  const now = new Date("2026-06-17T00:00:00Z");

  it("keeps matches published within the window", () => {
    const matches = [{ ...baseMatch, ocid: "a", published_date: "2026-06-12" }];
    expect(publishedWithinDays(matches, 7, now)).toHaveLength(1);
  });

  it("drops matches published outside the window", () => {
    const matches = [{ ...baseMatch, ocid: "a", published_date: "2026-06-01" }];
    expect(publishedWithinDays(matches, 7, now)).toHaveLength(0);
  });

  it("drops matches published in the future", () => {
    const matches = [{ ...baseMatch, ocid: "a", published_date: "2026-06-20" }];
    expect(publishedWithinDays(matches, 7, now)).toHaveLength(0);
  });

  it("skips matches with no published_date", () => {
    const matches = [{ ...baseMatch, ocid: "a", published_date: "" }];
    expect(publishedWithinDays(matches, 7, now)).toHaveLength(0);
  });
});

describe("closingWithinDays", () => {
  it("keeps matches closing within the window", () => {
    const matches = [{ ...baseMatch, ocid: "a", days_to_close: 3 }];
    expect(closingWithinDays(matches, 7)).toHaveLength(1);
  });

  it("drops matches closing further out", () => {
    const matches = [{ ...baseMatch, ocid: "a", days_to_close: 8 }];
    expect(closingWithinDays(matches, 7)).toHaveLength(0);
  });

  it("drops already-closed matches", () => {
    const matches = [{ ...baseMatch, ocid: "a", days_to_close: -1 }];
    expect(closingWithinDays(matches, 7)).toHaveLength(0);
  });

  it("drops matches with no closing date", () => {
    const matches = [{ ...baseMatch, ocid: "a", days_to_close: null }];
    expect(closingWithinDays(matches, 7)).toHaveLength(0);
  });
});

describe("favouriteMatches", () => {
  it("keeps only matches whose ocid is favourited", () => {
    const matches = [
      { ...baseMatch, ocid: "a" },
      { ...baseMatch, ocid: "b" },
    ];
    expect(favouriteMatches(matches, ["b"]).map((m) => m.ocid)).toEqual(["b"]);
  });

  it("returns empty when nothing is favourited", () => {
    const matches = [{ ...baseMatch, ocid: "a" }];
    expect(favouriteMatches(matches, [])).toHaveLength(0);
  });
});

describe("provincesWithCounts", () => {
  it("counts and sorts distinct provinces", () => {
    const matches = [
      { ...baseMatch, ocid: "a", province: "Western Cape" },
      { ...baseMatch, ocid: "b", province: "Gauteng" },
      { ...baseMatch, ocid: "c", province: "Gauteng" },
    ];
    expect(provincesWithCounts(matches)).toEqual([
      { province: "Gauteng", count: 2 },
      { province: "Western Cape", count: 1 },
    ]);
  });

  it("groups null provinces as Unspecified", () => {
    const matches = [{ ...baseMatch, ocid: "a", province: null }];
    expect(provincesWithCounts(matches)).toEqual([{ province: "Unspecified", count: 1 }]);
  });
});

describe("filterByProvince", () => {
  it("returns everything when province is null", () => {
    const matches = [{ ...baseMatch, ocid: "a", province: "Gauteng" }];
    expect(filterByProvince(matches, null)).toHaveLength(1);
  });

  it("filters to the given province", () => {
    const matches = [
      { ...baseMatch, ocid: "a", province: "Gauteng" },
      { ...baseMatch, ocid: "b", province: "Limpopo" },
    ];
    expect(filterByProvince(matches, "Limpopo").map((m) => m.ocid)).toEqual(["b"]);
  });
});

describe("matchesWithBriefings", () => {
  it("keeps only matches with a scheduled briefing session", () => {
    const matches = [
      { ...baseMatch, ocid: "a", briefing_session: { has_session: true, compulsory: true, date: "2026-06-20T10:00:00Z", venue: "Teams" } },
      { ...baseMatch, ocid: "b", briefing_session: null },
      { ...baseMatch, ocid: "c", briefing_session: { has_session: false, compulsory: false, date: "", venue: "" } },
    ];
    expect(matchesWithBriefings(matches).map((m) => m.ocid)).toEqual(["a"]);
  });
});

describe("groupBriefingsByDate", () => {
  it("groups briefings by SAST calendar date", () => {
    const matches = [
      { ...baseMatch, ocid: "a", briefing_session: { has_session: true, compulsory: true, date: "2026-06-20T10:00:00Z", venue: "Teams" } },
      { ...baseMatch, ocid: "b", briefing_session: { has_session: true, compulsory: false, date: "2026-06-20T13:00:00Z", venue: "Zoom" } },
      { ...baseMatch, ocid: "c", briefing_session: { has_session: true, compulsory: true, date: "2026-06-21T09:00:00Z", venue: "Teams" } },
    ];
    const grouped = groupBriefingsByDate(matches);
    expect([...grouped.keys()].sort()).toEqual(["2026-06-20", "2026-06-21"]);
    expect(grouped.get("2026-06-20")!.map((m) => m.ocid)).toEqual(["a", "b"]);
  });

  it("sorts same-day briefings by time", () => {
    const matches = [
      { ...baseMatch, ocid: "later", briefing_session: { has_session: true, compulsory: true, date: "2026-06-20T13:00:00Z", venue: "Teams" } },
      { ...baseMatch, ocid: "earlier", briefing_session: { has_session: true, compulsory: true, date: "2026-06-20T09:00:00Z", venue: "Teams" } },
    ];
    expect(groupBriefingsByDate(matches).get("2026-06-20")!.map((m) => m.ocid)).toEqual(["earlier", "later"]);
  });
});
