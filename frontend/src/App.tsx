import { useEffect, useState, useCallback } from "react";
import { Tabs } from "./components/Tabs";
import { HealthChip } from "./components/HealthChip";
import { HealthBanner } from "./components/HealthBanner";
import { MatchList } from "./components/MatchList";
import { DetailDrawer } from "./components/DetailDrawer";
import { ConfigForm } from "./components/ConfigForm";
import { Toast } from "./components/Toast";
import {
  getHealth, getMatches, getConfig,
  type Config, type HealthResponse, type Match, type MatchesResponse,
} from "./api/client";

type View = "list" | "config";

export default function App() {
  const [view, setView] = useState<View>("list");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [data, setData] = useState<MatchesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Match | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bust, setBust] = useState<number>(Date.now());

  const loadMatches = useCallback(async (bustOverride?: number) => {
    setError(null);
    try {
      const r = await getMatches({ window: config?.lookback_days ?? 30, includeClosed: config?.include_closed ?? true, bust: String(bustOverride ?? bust) });
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load matches");
    }
  }, [bust, config]);

  useEffect(() => {
    void getHealth().then(setHealth).catch(() => setHealth({ ok: false, etenders_reachable: false, config_path: "" }));
  }, []);

  useEffect(() => {
    void getConfig().then((r) => setConfig(r.config)).catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    if (view === "list" && config) void loadMatches();
  }, [view, config, loadMatches]);

  function handleConfigSaved() {
    setToast("Saved");
    setView("list");
    const newBust = Date.now();
    setBust(newBust);
    void loadMatches(newBust);
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-outline-variant bg-surface px-8 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-primary">Tender Watch</h1>
            <p className="text-xs text-on-surface-variant">
              {data ? `${data.stats.matched} matches from the last ${config?.lookback_days ?? 30} days` : "Loading…"}
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
              onClick={() => {
                const newBust = Date.now();
                setBust(newBust);
                void loadMatches(newBust);
              }}
              className="rounded-card bg-primary-container px-4 py-2 text-sm font-bold text-on-primary-container"
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
          <ConfigForm initial={config} onSaved={handleConfigSaved} />
        )}
      </main>

      <DetailDrawer match={selected} onClose={() => setSelected(null)} />
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
