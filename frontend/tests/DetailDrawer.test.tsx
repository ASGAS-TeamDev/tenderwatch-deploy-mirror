import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DetailDrawer } from "../src/components/DetailDrawer";
import type { Match } from "../src/api/client";

const match: Match = {
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
  delivery_location: "124 Pretorius Street, Pretoria",
  special_conditions: "Documents available from 15/06/2026 to 20/06/2026",
  contact_person: { name: "Jane Doe", email: "jane@sita.gov.za", telephone: "012-345-6789" },
  briefing_session: { has_session: true, compulsory: true, date: "2026-06-20", venue: "SITA Head Office, Pretoria" },
  documents: [{ title: "Bid invitation", url: "https://www.etenders.gov.za/home/Download?blobName=test1.doc", format: "doc", date_published: "2026-06-14" }],
  published_date: "2026-06-15",
  tender_start_date: "2026-06-15",
  heading: "",
};

describe("DetailDrawer", () => {
  it("renders nothing when match is null", () => {
    const { container } = render(<DetailDrawer match={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the key sections and document download link", () => {
    render(<DetailDrawer match={match} onClose={() => {}} />);
    expect(screen.getByText(/^description$/i)).toBeInTheDocument();
    expect(screen.getByText(/^buyer$/i)).toBeInTheDocument();
    expect(screen.getByText(/^value$/i)).toBeInTheDocument();
    expect(screen.getByText(/^dates$/i)).toBeInTheDocument();
    expect(screen.getByText(/^procurement details$/i)).toBeInTheDocument();
    expect(screen.getByText(/^contact person$/i)).toBeInTheDocument();
    expect(screen.getByText(/^documents \(1\)$/i)).toBeInTheDocument();
    const docLink = screen.getByRole("link", { name: /bid invitation/i });
    expect(docLink).toHaveAttribute("href", "https://www.etenders.gov.za/home/Download?blobName=test1.doc");
  });

  it("routes PDF documents through the inline-view proxy instead of linking straight to eTenders", () => {
    const pdfMatch: Match = {
      ...match,
      documents: [{ title: "Bid invitation", url: "https://www.etenders.gov.za/home/Download?blobName=test1.pdf", format: "pdf", date_published: "2026-06-14" }],
    };
    render(<DetailDrawer match={pdfMatch} onClose={() => {}} />);
    const docLink = screen.getByRole("link", { name: /bid invitation/i });
    expect(docLink).toHaveAttribute("href", "/api/matches/ocds-1/documents/0/view");
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    render(<DetailDrawer match={match} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
