import { describe, it, expect, vi, beforeEach } from "vitest";
import { getHealth, getMatches, getConfig, putConfig } from "../src/api/client";

describe("api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("getHealth returns parsed JSON on 2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, etenders_reachable: true, config_path: "/x" }), {
        status: 200,
      }),
    );
    const r = await getHealth();
    expect(r.ok).toBe(true);
  });

  it("getMatches throws with detail on 503", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ detail: { error: "upstream_unavailable", cached_response: null } }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(getMatches({ window: 30 })).rejects.toThrow(/upstream_unavailable/);
  });

  it("putConfig sends PUT with the body as JSON", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ config: { lookback_days: 14 }, config_digest: "abc" }), {
        status: 200,
      }),
    );
    await putConfig({ lookback_days: 14, page_size: 100, high_value_threshold_zar: 5_000_000, closing_soon_days: 7, include_closed: true, keywords: [], buyer_allowlist: [] });
    expect(spy).toHaveBeenCalledWith("/api/config", expect.objectContaining({ method: "PUT" }));
  });
});