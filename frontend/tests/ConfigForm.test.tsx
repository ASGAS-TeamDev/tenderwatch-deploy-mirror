import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigForm } from "../src/components/ConfigForm";
import * as api from "../src/api/client";
import { ApiError } from "../src/api/client";
import type { Config } from "../src/api/client";

const baseConfig: Config = {
  lookback_days: 7,
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

  it("shows a conflict banner instead of overwriting when the config changed elsewhere", async () => {
    const theirConfig: Config = { ...baseConfig, keywords: ["theirs"] };
    const putSpy = vi.spyOn(api, "putConfig")
      .mockRejectedValueOnce(
        new ApiError("config_modified", 409, {
          detail: { error: "config_modified", current_config: theirConfig, current_digest: "new-digest" },
        }),
      )
      .mockResolvedValueOnce({ config: theirConfig, config_digest: "new-digest" });
    const onSaved = vi.fn();
    render(<ConfigForm initial={baseConfig} initialDigest="old-digest" onSaved={onSaved} />);

    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByText(/someone else saved changes/i)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /overwrite with my version anyway/i }));
    await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(2));
    // Second call is a forced overwrite — no If-Match digest sent.
    expect(putSpy).toHaveBeenLastCalledWith(baseConfig, undefined);
    expect(onSaved).toHaveBeenCalled();
  });
});
