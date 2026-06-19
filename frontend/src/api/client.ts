// Types match the backend's Pydantic models (see backend/app/models.py).

// API base URL: VITE_API_BASE is set at build time on Vercel (e.g. the Render
// service URL). In dev, vite.config.ts proxies `/api/*` to localhost, so we
// fall back to a relative origin (empty string → fetch uses the page origin).
const API_BASE: string = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

function url(path: string): string {
  // path is expected to start with "/api/...".
  return `${API_BASE}${path}`;
}

export interface Config {
  lookback_days: number;
  page_size: number;
  high_value_threshold_zar: number;
  closing_soon_days: number;
  include_closed: boolean;
  keywords: string[];
  buyer_allowlist: string[];
}

export interface Match {
  ocid: string;
  title: string;
  buyer: string;
  procuring_entity: string;
  value_zar: number | null;
  value_display: string;
  closing_date: string;
  days_to_close: number | null;
  province: string | null;
  category: string | null;
  link: string;
  flags: Array<"high-value" | "closing-soon" | "closed">;
  matched_on: { keywords: string[]; buyers: string[] };
}

export interface Stats {
  releases_scanned: number;
  matched: number;
  rejected_by_status: number;
  rejected_no_keyword_no_buyer: number;
}

export interface MatchesResponse {
  fetched_at: string;
  window: { from: string; to: string };
  config_digest: string;
  stats: Stats;
  matches: Match[];
  cached_response: MatchesResponse | null;
}

export interface HealthResponse {
  ok: boolean;
  etenders_reachable: boolean;
  config_path: string;
  detail?: string;
}

export interface ConfigResponse {
  config: Config;
  config_digest: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(url(path), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!resp.ok) {
    let detail: unknown = null;
    try {
      detail = await resp.json();
    } catch {
      // ignore
    }
    const message = (() => {
      if (detail && typeof detail === "object" && "detail" in detail) {
        const d = (detail as { detail: unknown }).detail;
        if (typeof d === "string") return d;
        if (d && typeof d === "object" && "error" in d) {
          return (d as { error: string }).error;
        }
      }
      return `HTTP ${resp.status}`;
    })();
    throw new Error(message);
  }
  return resp.json() as Promise<T>;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health");
}

export function getMatches(params: { window?: number; includeClosed?: boolean; bust?: string } = {}): Promise<MatchesResponse> {
  const qs = new URLSearchParams();
  if (params.window) qs.set("window", String(params.window));
  if (params.includeClosed !== undefined) qs.set("include_closed", String(params.includeClosed));
  if (params.bust) qs.set("bust", params.bust);
  const q = qs.toString();
  return request<MatchesResponse>(`/api/matches${q ? `?${q}` : ""}`);
}

export function getConfig(): Promise<ConfigResponse> {
  return request<ConfigResponse>("/api/config");
}

export function putConfig(config: Config): Promise<ConfigResponse> {
  return request<ConfigResponse>("/api/config", { method: "PUT", body: JSON.stringify(config) });
}