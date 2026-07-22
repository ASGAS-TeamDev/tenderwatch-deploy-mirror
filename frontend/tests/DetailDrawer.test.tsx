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
  link: "https://www.etenders.gov.za/Home/opportunities?id=1&filter=Provision%20of%20Cloud%20Hosting%20Services%20for%20Government%20Departments&search=Provision%20of%20Cloud%20Hosting%20Services%20for%20Government%20Departments",
  flags: ["high-value", "closing-soon"],
  matched_on: { keywords: ["cloud"], buyers: ["sita"] },
};

describe("DetailDrawer", () => {
  it("renders nothing when match is null", () => {
    const { container } = render(<DetailDrawer match={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the six sections and the View on eTenders link", () => {
    render(<DetailDrawer match={match} onClose={() => {}} />);
    expect(screen.getByText(/^description$/i)).toBeInTheDocument();
    expect(screen.getByText(/^buyer$/i)).toBeInTheDocument();
    expect(screen.getByText(/^value$/i)).toBeInTheDocument();
    expect(screen.getByText(/^closing date$/i)).toBeInTheDocument();
    expect(screen.getByText(/^lots and items$/i)).toBeInTheDocument();
    expect(screen.getByText(/^documents$/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /view on etenders/i });
    expect(link).toHaveAttribute("href", match.link);
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    render(<DetailDrawer match={match} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
