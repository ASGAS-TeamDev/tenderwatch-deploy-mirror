import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HealthChip } from "../src/components/HealthChip";
import type { HealthResponse } from "../src/api/client";

const baseHealth: HealthResponse = {
  ok: true,
  etenders_reachable: true,
  config_path: "./config/tender-watch.json",
};

describe("HealthChip", () => {
  it("shows checking… when health is null", () => {
    render(<HealthChip health={null} />);
    expect(screen.getByText(/checking/i)).toBeInTheDocument();
  });

  it("shows eTenders OK / UNREACHABLE based on etenders_reachable", () => {
    render(<HealthChip health={baseHealth} />);
    expect(screen.getByText(/etenders ok/i)).toBeInTheDocument();

    render(<HealthChip health={{ ...baseHealth, etenders_reachable: false }} />);
    expect(screen.getByText(/etenders unreachable/i)).toBeInTheDocument();
  });

  it("does not show a sync pill when last_synced_at is absent", () => {
    render(<HealthChip health={baseHealth} />);
    expect(screen.queryByText(/synced/i)).not.toBeInTheDocument();
  });

  it("shows a fresh sync pill when last_synced_at is recent", () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
    render(<HealthChip health={{ ...baseHealth, last_synced_at: recent }} />);
    expect(screen.getByText(/synced 1 hour ago/i)).toBeInTheDocument();
  });

  it("flags a stale sync (>36h) visually via a warning class", () => {
    const stale = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 2 days ago
    render(<HealthChip health={{ ...baseHealth, last_synced_at: stale }} />);
    const pill = screen.getByText(/synced 2 days ago/i);
    expect(pill.className).toContain("warning-container");
  });
});
