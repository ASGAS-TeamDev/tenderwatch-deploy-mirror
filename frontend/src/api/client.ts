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
  // Optional so existing test fixtures / older cached configs that predate
  // this field still type-check — the backend always sends it explicitly
  // (defaults to false there).
  match_all_buyers?: boolean;
  favourited_ocids: string[];
}

export interface TenderDocument {
  title: string;
  url: string;
  format: string | null;
  date_published: string | null;
}

export interface ContactPerson {
  name: string;
  email: string;
  telephone: string;
}

export interface BriefingSession {
  has_session: boolean;
  compulsory: boolean;
  date: string;
  venue: string;
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
  flags: Array<"high-value" | "closing-soon" | "closed" | "briefing-required" | "briefing-scheduled" | "briefing-missed">;
  matched_on: { keywords: string[]; buyers: string[] };
  // Rich fields (added 2026-07-22)
  description: string;
  status: string;
  procurement_method: string;
  delivery_location: string;
  special_conditions: string;
  contact_person: ContactPerson | null;
  briefing_session: BriefingSession | null;
  documents: TenderDocument[];
  published_date: string;
  tender_start_date: string;
  heading: string;
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
  // Postgres sync freshness. Null when TW_DATABASE_URL isn't configured
  // (dev fallback — matches come from the live eTenders fetch instead)
  // or no successful sync has landed yet.
  last_synced_at?: string | null;
}

export interface ConfigResponse {
  config: Config;
  config_digest: string;
}

// Thrown for any non-2xx response. Carries the HTTP status and the parsed
// body's `detail` (FastAPI's HTTPException shape) so callers that need more
// than a message — e.g. a 409 config conflict — can inspect it.
export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 180_000): Promise<T> {
  // Client-side timeout so a stuck backend doesn't pin the UI forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url(path), {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!resp.ok) {
      let body: unknown = null;
      try {
        body = await resp.json();
      } catch {
        // ignore
      }
      const message = (() => {
        if (body && typeof body === "object" && "detail" in body) {
          const d = (body as { detail: unknown }).detail;
          if (typeof d === "string") return d;
          if (d && typeof d === "object" && "error" in d) {
            return (d as { error: string }).error;
          }
        }
        return `HTTP ${resp.status}`;
      })();
      throw new ApiError(message, resp.status, body);
    }
    return resp.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s — the backend may be slow to respond (cold start, rate limit, or large lookback window).`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health");
}

export function getMatches(params: { window?: number; includeClosed?: boolean; bust?: string; showAll?: boolean } = {}): Promise<MatchesResponse> {
  const qs = new URLSearchParams();
  if (params.window) qs.set("window", String(params.window));
  if (params.includeClosed !== undefined) qs.set("include_closed", String(params.includeClosed));
  if (params.bust) qs.set("bust", params.bust);
  if (params.showAll) qs.set("show_all", "true");
  const q = qs.toString();
  return request<MatchesResponse>(`/api/matches${q ? `?${q}` : ""}`);
}

export function getSummary(ocid: string): Promise<{ summary: string }> {
  return request<{ summary: string }>(`/api/matches/${encodeURIComponent(ocid)}/summary`, {}, 90_000);
}

// Same-origin proxy that re-serves a document with Content-Disposition:
// inline — eTenders sends every document as an attachment, which forces a
// browser download no matter how the frontend links to it directly.
export function documentViewUrl(ocid: string, index: number): string {
  return url(`/api/matches/${encodeURIComponent(ocid)}/documents/${index}/view`);
}

export function getConfig(): Promise<ConfigResponse> {
  return request<ConfigResponse>("/api/config");
}

export function putConfig(config: Config, expectedDigest?: string): Promise<ConfigResponse> {
  return request<ConfigResponse>("/api/config", {
    method: "PUT",
    body: JSON.stringify(config),
    // Optimistic concurrency: if someone else saved since we loaded this
    // digest, the backend returns 409 instead of silently overwriting them.
    headers: expectedDigest ? { "If-Match": expectedDigest } : {},
  });
}

// Shape of the 409 response body's `detail` field (see backend/app/routes/config.py).
export interface ConfigConflictDetail {
  error: "config_modified";
  current_config: Config;
  current_digest: string;
}

export function isConfigConflict(e: unknown): e is ApiError & { detail: { detail: ConfigConflictDetail } } {
  return (
    e instanceof ApiError &&
    e.status === 409 &&
    !!e.detail &&
    typeof e.detail === "object" &&
    "detail" in (e.detail as object) &&
    (e.detail as { detail?: { error?: string } }).detail?.error === "config_modified"
  );
}
