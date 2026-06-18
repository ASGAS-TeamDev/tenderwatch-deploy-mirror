import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigForm } from "../src/components/ConfigForm";
import * as api from "../src/api/client";
import type { Config } from "../src/api/client";

const baseConfig: Config = {
  lookback_days: 30,
  page_size: 100,
  high_value_threshold_zar: 5_000_000,
  closing_soon_days: 7,
  include_closed: true,
  keywords: ["software", "cloud"],
  buyer_allowlist: ["sita"],
};

describe("ConfigForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an inline error when lookback is out of range", async () => {
    render(<ConfigForm initial={baseConfig} onSaved={() => {}} />);
    const input = screen.getByLabelText(/lookback window/i);
    await userEvent.clear(input);
    await userEvent.type(input, "2");
    expect(await screen.findByText(/must be between 7 and 90/i)).toBeInTheDocument();
  });

  it("calls putConfig and the onSaved callback on a valid save", async () => {
    const putSpy = vi.spyOn(api, "putConfig").mockResolvedValue({
      config: baseConfig,
      config_digest: "abc",
    });
    const onSaved = vi.fn();
    render(<ConfigForm initial={baseConfig} onSaved={onSaved} />);
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(putSpy).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalled();
  });
});
