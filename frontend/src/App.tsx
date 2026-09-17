import { useEffect, useState, useCallback } from "react";
import { Tabs } from "./components/Tabs";
import { HealthChip } from "./components/HealthChip";
import { HealthBanner } from "./components/HealthBanner";
import { MatchList } from "./components/MatchList";
import { DetailDrawer } from "./components/DetailDrawer";
import { ConfigForm } from "./components/ConfigForm";
import { Toast } from "./components/Toast";
import { LoadingModal } from "./components/LoadingModal";
import {
  getHealth, getMatches, getConfig,
  type Config, type HealthResponse, type Match, type MatchesResponse,
} from "./api/client";

type View = "list" | "config";

export default function App() {
  const [view, setView] = useState<View>("list");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [configDigest, setConfigDigest] = useState<string | null>(null);
  const [data, setData] = useState<MatchesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Match | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // A cold cache (first request after any backend restart) can genuinely
  // take 1-2 minutes to fetch — the request itself already carries a 180s
  // client timeout for that. If it still times out (slow upstream, or the
  // request landed mid-warm and lost the race), the fetch keeps running on
  // the server and finishes shortly after — so one automatic retry almost
  // always picks up the now-warm cache instead of leaving the user staring
  // at a dead-end error.
  const loadMatches = useCallback(async (attempt = 1) => {
    setError(null);
    setLoading(true);
    setRetrying(attempt > 1);
    try {
      // No bust — the backend warmer + SWR cache keeps data fresh.
      // Sending bust forces a blocking 80s+ cold fetch which times out.
      const r = await getMatches({ window: config?.lookback_days ?? 7, includeClosed: config?.include_closed ?? true });
      setData(r);
      setLoading(false);
      setRetrying(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load matches";
      if (message.includes("timed out") && attempt < 2) {
        void loadMatches(attempt + 1);
        return;
      }
      setError(message);
      setLoading(false);
      setRetrying(false);
    }
  }, [config]);

  useEffect(() => {
    void getHealth().then(setHealth).catch(() => setHealth({ ok: false, etenders_reachable: false, config_path: "" }));
  }, []);

  const refreshConfig = useCallback(async () => {
    const r = await getConfig();
    setConfig(r.config);
    setConfigDigest(r.config_digest);
  }, []);

  useEffect(() => {
    void refreshConfig().catch(() => setConfig(null));
  }, [refreshConfig]);

  useEffect(() => {
    if (view === "list" && config) void loadMatches();
  }, [view, config, loadMatches]);

  function handleConfigSaved() {
    setToast("Saved");
    setView("list");
    // Re-fetch config so we hold its fresh digest (needed for the next
    // save's If-Match check) — then reload from cache. The backend warmer
    // picks up config changes on the next warm cycle (every 30s) without a
    // blocking fetch.
    void refreshConfig();
    void loadMatches();
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-outline-variant bg-gradient-to-r from-gradient-start to-gradient-end px-8 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-wider text-on-dark-surface" style={{ fontFamily: "Michroma, sans-serif" }}>
              TENDER WATCH
            </h1>
            <p className="mt-1 text-xs text-on-dark-surface/70">
              {data ? `${data.stats.matched} matches from the last ${config?.lookback_days ?? 7} days` : "Loading…"}
            </p>
          </div>
          <HealthChip health={health} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-8 py-6">
        <div className="flex items-center justify-between">
          <Tabs
            tabs={[{ id: "list", label: "List" }, { id: "config", label: "Config" }]}
            active={view}
            onChange={(id) => setView(id as View)}
          />
          {view === "list" && (
            <button
              type="button"
              onClick={() => void loadMatches()}
              className="rounded-card bg-primary-bright px-4 py-2 text-sm font-bold text-on-primary transition hover:opacity-90"
            >
              Refresh ↻
            </button>
          )}
        </div>

        {error && <HealthBanner message={error} />}

        {view === "list" && data && (
          <MatchList
            matches={data.matches}
            onSelect={(m) => setSelected(m)}
            upstreamDown={
              health && !health.etenders_reachable
                ? { cachedAt: new Date(data.fetched_at).toLocaleTimeString() }
                : undefined
            }
          />
        )}

        {view === "config" && config && (
          <ConfigForm initial={config} initialDigest={configDigest} onSaved={handleConfigSaved} />
        )}
      </main>

      <DetailDrawer match={selected} onClose={() => setSelected(null)} />
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      <LoadingModal visible={loading} retrying={retrying} />
    </div>
  );
}
