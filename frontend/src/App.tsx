import { useEffect, useState, useCallback, useMemo } from "react";
import { Tabs } from "./components/Tabs";
import { HealthChip } from "./components/HealthChip";
import { HealthBanner } from "./components/HealthBanner";
import { MatchList } from "./components/MatchList";
import { RegionsView } from "./components/RegionsView";
import { BriefingsCalendar } from "./components/BriefingsCalendar";
import { DetailDrawer } from "./components/DetailDrawer";
import { ExecutiveSummaryModal } from "./components/ExecutiveSummaryModal";
import { ConfigForm } from "./components/ConfigForm";
import { Toast } from "./components/Toast";
import { LoadingModal } from "./components/LoadingModal";
import {
  getHealth, getMatches, getConfig, putConfig, isConfigConflict,
  type Config, type HealthResponse, type Match, type MatchesResponse,
} from "./api/client";
import { publishedWithinDays, closingWithinDays, favouriteMatches, matchesWithBriefings, searchMatches } from "./lib/matchFilters";

type View = "list" | "published7" | "closing7" | "favourites" | "regions" | "briefings" | "config";

export default function App() {
  const [view, setView] = useState<View>("list");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [configDigest, setConfigDigest] = useState<string | null>(null);
  const [data, setData] = useState<MatchesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Match | null>(null);
  const [summaryMatch, setSummaryMatch] = useState<Match | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // Temporary bypass while the keyword/buyer config is being retuned —
  // shows every non-rejected release instead of only keyword/buyer
  // matches. Defaults on so there's something to look at immediately;
  // flip off once the config is trusted again. Session-only (not saved).
  const [showAll, setShowAll] = useState(true);
  const [search, setSearch] = useState("");

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
      const r = await getMatches({
        window: config?.lookback_days ?? 7,
        includeClosed: config?.include_closed ?? true,
        showAll,
      });
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
  }, [config, showAll]);

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

  const toggleFavourite = useCallback(async (ocid: string) => {
    if (!config) return;
    const nextFor = (base: Config) => {
      const has = base.favourited_ocids.includes(ocid);
      return has
        ? base.favourited_ocids.filter((o) => o !== ocid)
        : [...base.favourited_ocids, ocid];
    };
    try {
      const r = await putConfig({ ...config, favourited_ocids: nextFor(config) }, configDigest ?? undefined);
      setConfig(r.config);
      setConfigDigest(r.config_digest);
    } catch (e) {
      if (isConfigConflict(e)) {
        // Rare for a single-user tool, but the on-disk config changed since
        // we loaded it — refetch and retry the toggle once against the
        // fresh digest instead of surfacing a full conflict UI for a star click.
        const fresh = await getConfig();
        const r2 = await putConfig({ ...fresh.config, favourited_ocids: nextFor(fresh.config) }, fresh.config_digest);
        setConfig(r2.config);
        setConfigDigest(r2.config_digest);
      } else {
        setToast(e instanceof Error ? e.message : "Failed to update favourites");
      }
    }
  }, [config, configDigest]);

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

  // Free-text search applied on top of whatever the backend/showAll already
  // returned — recomputed only when the underlying data or query changes,
  // then reused for the tab counts and every view below so they stay in sync.
  const visibleMatches = useMemo(
    () => (data ? searchMatches(data.matches, search) : []),
    [data, search],
  );

  function upstreamDown(d: MatchesResponse): { cachedAt: string } | undefined {
    return health && !health.etenders_reachable
      ? { cachedAt: new Date(d.fetched_at).toLocaleTimeString() }
      : undefined;
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
        <div className="space-y-3">
          <div className="grid grid-cols-2 items-center gap-3 border-b border-outline pb-3 sm:grid-cols-4">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, buyer, description…"
              aria-label="Search tenders"
              className="col-span-2 w-full rounded-card border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none sm:col-span-1"
            />
            <label
              className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant"
              title="Bypasses the keyword/buyer filter and shows every non-rejected release — a temporary way to see everything while the Config keywords are being retuned."
            >
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
              />
              Show all (bypass filter)
            </label>
            <button
              type="button"
              onClick={() => setView("config")}
              aria-pressed={view === "config"}
              className={[
                "justify-self-center rounded-card border px-4 py-2 text-sm font-bold transition",
                view === "config"
                  ? "border-primary bg-primary-container text-on-primary-container"
                  : "border-outline-variant bg-surface text-on-surface-variant hover:border-primary",
              ].join(" ")}
              style={{ fontFamily: "Orbitron, sans-serif" }}
            >
              ⚙️ Config
            </button>
            <button
              type="button"
              onClick={() => void loadMatches()}
              className="justify-self-end rounded-card bg-primary-bright px-4 py-2 text-sm font-bold text-on-primary transition hover:opacity-90"
            >
              Refresh ↻
            </button>
          </div>

          <div className="min-w-0 overflow-x-auto">
            <Tabs
              tabs={[
                { id: "list", icon: "📋", iconClassName: "text-primary", label: data ? `List (${visibleMatches.length})` : "List" },
                {
                  id: "published7",
                  icon: "🆕",
                  iconClassName: "text-success",
                  label: data ? `Published 7 (${publishedWithinDays(visibleMatches, 7).length})` : "Published 7",
                },
                {
                  id: "closing7",
                  icon: "⏰",
                  iconClassName: "text-warning",
                  label: data ? `Closing 7 (${closingWithinDays(visibleMatches, 7).length})` : "Closing 7",
                },
                {
                  id: "favourites",
                  icon: "⭐",
                  iconClassName: "text-warning",
                  label: data
                    ? `Favourites (${favouriteMatches(visibleMatches, config?.favourited_ocids ?? []).length})`
                    : "Favourites",
                },
                { id: "regions", icon: "📍", iconClassName: "text-secondary", label: data ? `Regions (${visibleMatches.length})` : "Regions" },
                {
                  id: "briefings",
                  icon: "📅",
                  iconClassName: "text-error",
                  label: data ? `Briefings (${matchesWithBriefings(visibleMatches).length})` : "Briefings",
                },
              ]}
              active={view}
              onChange={(id) => setView(id as View)}
            />
          </div>
        </div>

        {error && <HealthBanner message={error} />}

        {view === "list" && data && (
          <MatchList
            matches={visibleMatches}
            onSelect={(m) => setSelected(m)}
            favouritedOcids={config?.favourited_ocids}
            onToggleFavourite={toggleFavourite}
            onExecutiveSummary={setSummaryMatch}
            upstreamDown={upstreamDown(data)}
          />
        )}

        {view === "published7" && data && (
          <MatchList
            matches={publishedWithinDays(visibleMatches, 7)}
            onSelect={(m) => setSelected(m)}
            favouritedOcids={config?.favourited_ocids}
            onToggleFavourite={toggleFavourite}
            onExecutiveSummary={setSummaryMatch}
            upstreamDown={upstreamDown(data)}
            emptyHeadline="Nothing published in the last 7 days"
            emptyBody="Check back later, or browse the full List tab."
          />
        )}

        {view === "closing7" && data && (
          <MatchList
            matches={closingWithinDays(visibleMatches, 7)}
            onSelect={(m) => setSelected(m)}
            favouritedOcids={config?.favourited_ocids}
            onToggleFavourite={toggleFavourite}
            onExecutiveSummary={setSummaryMatch}
            upstreamDown={upstreamDown(data)}
            emptyHeadline="Nothing closing in the next 7 days"
            emptyBody="Check back later, or browse the full List tab."
          />
        )}

        {view === "favourites" && data && (
          <MatchList
            matches={favouriteMatches(visibleMatches, config?.favourited_ocids ?? [])}
            onSelect={(m) => setSelected(m)}
            favouritedOcids={config?.favourited_ocids}
            onToggleFavourite={toggleFavourite}
            onExecutiveSummary={setSummaryMatch}
            upstreamDown={upstreamDown(data)}
            emptyHeadline="No favourites yet"
            emptyBody="Star a tender from any list to pin it here."
          />
        )}

        {view === "regions" && data && (
          <RegionsView
            matches={visibleMatches}
            onSelect={(m) => setSelected(m)}
            favouritedOcids={config?.favourited_ocids}
            onToggleFavourite={toggleFavourite}
            onExecutiveSummary={setSummaryMatch}
            upstreamDown={upstreamDown(data)}
          />
        )}

        {view === "briefings" && data && (
          <BriefingsCalendar matches={visibleMatches} onSelect={(m) => setSelected(m)} />
        )}

        {view === "config" && config && (
          <ConfigForm initial={config} initialDigest={configDigest} onSaved={handleConfigSaved} />
        )}
      </main>

      <DetailDrawer match={selected} onClose={() => setSelected(null)} />
      <ExecutiveSummaryModal match={summaryMatch} onClose={() => setSummaryMatch(null)} />
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      <LoadingModal visible={loading} retrying={retrying} />
    </div>
  );
}
