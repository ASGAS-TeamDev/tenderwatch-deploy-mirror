# Tender Watch — App Build Design

**Date:** 2026-06-17
**Status:** Approved (brainstorming exit)
**Scope:** Full v1 build — FastAPI backend, Vite/React frontend, deploy to Render + Vercel. Visual layer = seven Stitch screens (Tonal Spot, Inter, 8 dp, light).
**Companion to:**
- `Tender Watch/scope.md` (planning repo, origin + pivots)
- `Tender Watch/2026-06-17-tender-watch-design.md` (planning repo, system design — supersedes for this build)
- `Tender Watch/2026-06-17-tender-watch.md` (planning repo, six-phase plan)
- `Tender Watch/docs/superpowers/specs/2026-06-17-tender-watch-mockups-design/` (planning repo, visual layer)

**Target repo:** `C:\UNLIMITED DEV\MAIN Work Space\tender-watch\` (new, not yet created)

---

## 1. Why this doc exists

The planning repo holds the system spec (FastAPI + Vite, OCDS filter rules, HTTP API shapes) and a visual layer (seven Stitch screens). The six-phase implementation plan in the planning repo covers the build. This document is a thin bridge: it pins the new decisions (Tailwind v4, pytest + Vitest + Testing Library, Render + Vercel, random subdomain, sequential build order) that the original plan left open, points at the visual layer as the React build's design spec, and lists the open items to confirm during build.

This spec does not duplicate the system spec. Where the system spec and this doc disagree, the system spec wins. Where the system spec is silent, this doc fills in the gap.

## 2. Repo structure

```
tender-watch/
├── README.md                       # setup, env vars, run locally, deploy
├── .gitignore
├── .editorconfig
├── LICENSE                         # MIT
├── backend/
│   ├── pyproject.toml              # Python 3.12+, FastAPI, uvicorn, pytest, httpx
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI entry, CORS, route registration
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── matches.py          # GET /api/matches
│   │   │   ├── config.py           # GET/PUT /api/config
│   │   │   └── health.py           # GET /api/health
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── etenders.py         # async httpx client, paginated fetch
│   │   │   ├── filter.py           # apply_rules(release, config) -> FilterResult
│   │   │   └── cache.py            # TTL cache, SHA-256 keyed
│   │   ├── models.py               # Pydantic: Match, Config, Release
│   │   ├── config_store.py         # load/save tender-watch.json (atomic write)
│   │   └── settings.py             # env-var loader (pydantic-settings)
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py             # fixtures: sample_release, sample_page
│   │   ├── fixtures/
│   │   │   ├── sample_release.json
│   │   │   └── sample_page.json
│   │   ├── test_filter.py
│   │   ├── test_config_store.py
│   │   ├── test_cache.py
│   │   └── test_api.py             # FastAPI TestClient end-to-end
│   └── .env.example
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts              # dev proxy /api/* → http://localhost:8000
│   ├── tailwind.config.ts          # v4: import in CSS, define tokens
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                 # tab switcher, health chip
│   │   ├── api/
│   │   │   └── client.ts           # typed fetch wrappers
│   │   ├── components/
│   │   │   ├── MatchCard.tsx
│   │   │   ├── MatchList.tsx
│   │   │   ├── DetailDrawer.tsx
│   │   │   ├── ConfigForm.tsx
│   │   │   ├── HealthChip.tsx
│   │   │   ├── HealthBanner.tsx
│   │   │   ├── UpstreamBanner.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── FlagPill.tsx        # HIGH-VALUE / CLOSES IN N DAYS / CLOSED
│   │   │   ├── Tabs.tsx            # List | Config
│   │   │   └── Toast.tsx
│   │   ├── lib/
│   │   │   ├── format.ts           # ZAR, dates (SAST UTC+2)
│   │   │   └── relativeTime.ts
│   │   └── styles.css              # Tailwind v4 + design tokens
│   └── tests/
│       ├── MatchCard.test.tsx
│       ├── ConfigForm.test.tsx
│       ├── DetailDrawer.test.tsx
│       ├── api-client.test.ts
│       ├── format.test.ts
│       └── relativeTime.test.ts
└── deploy/
    ├── render.yaml                 # backend Blueprint
    └── vercel.json                 # frontend config
```

**Why this shape:**
- Two top-level packages match the two-stream build (Phases 1–5 run independently, integrate at Phase 6). The plan §1 shows the same shape.
- `services/` separates the eTenders client, the filter pipeline, and the cache. Each has one job, each is unit-testable in isolation.
- `routes/` is a thin layer that wires services into FastAPI. No business logic here.
- `models.py` (Pydantic) is the single source of truth for the HTTP response shapes.
- `components/` mirrors the seven Stitch screens — one component per visual element, plus a few helpers (FlagPill, Tabs, Toast). Each has its own Vitest test.
- `lib/format.ts` and `lib/relativeTime.ts` own the ZAR + date formatting rules.
- `deploy/` holds the host-specific config so the README can point at it.

## 3. Tech stack (pinned)

| Layer | Choice | Notes |
| --- | --- | --- |
| Backend language | Python 3.12+ | |
| Backend framework | FastAPI 0.115+ | |
| Backend ASGI server | uvicorn[standard] | One worker on Render free tier. |
| Backend HTTP client | httpx (async) | respx for mocking in tests. |
| Backend validation | Pydantic v2 | |
| Backend env vars | pydantic-settings | `app/settings.py` |
| Backend tests | pytest 8+, pytest-asyncio, FastAPI TestClient, respx | |
| Frontend language | TypeScript 5.x | |
| Frontend framework | React 19 | |
| Frontend bundler | Vite 6 | `@tailwindcss/vite` plugin. |
| Frontend styling | Tailwind CSS v4 | `@theme` block holds the design tokens. |
| Frontend tests | Vitest 2+, @testing-library/react, happy-dom | |
| Dates / currency | Native `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.RelativeTimeFormat` | No date-fns / dayjs. |
| Linting (Python) | ruff | |
| Linting (TS) | ESLint + typescript-eslint | No prettier. |
| State | None | `?bust=<ts>` query param handles cache invalidation. |
| Router | None | Tab switcher in `App.tsx`. |
| CI | None in v1 | Free-tier hosts auto-deploy from git. CI is v1.1. |

**Why these specifically:**
- Tailwind v4 (over v3) — v4's `@theme` block is what we need to wire the Stitch design tokens (Inter, 8 dp, Tonal Spot colors) into a usable utility-class set. The seven Stitch screens already render with Tailwind utility classes (per the planning repo's `verification.md`).
- `Intl` over date-fns / dayjs — built into every modern browser, ships zero KB, supports `en-ZA` locale for ZAR formatting natively.
- No router / no state library — keeps the bundle tiny, matches the v1 simplicity goal.

## 4. Data flow

### 4.1 Page load (happy path)

1. User opens the deployed Vite URL. `App.tsx` mounts.
2. `App.tsx` calls `getHealth()` on mount → renders `HealthChip` (green/amber).
3. If List tab is active (default), `MatchList.tsx` mounts and calls `getMatches({ window: 30, includeClosed: true })`.
4. `api/client.ts` issues `GET /api/matches?window=30&include_closed=true` (Vite dev proxy forwards to `http://localhost:8000`; in prod, same-origin via Vercel rewrites in `vercel.json`).
5. FastAPI route handler in `routes/matches.py`:
   - Reads current config from `config_store.py` (with defaults if file missing).
   - Computes `cache_key = SHA256(config_digest + window + include_closed)`.
   - If `cache_key` is in the in-memory TTL cache and not expired, return cached response.
   - Otherwise, call `services/etenders.fetch_releases(date_from, date_to, page_size)` — paginates via `PageNumber` until `links.next` is absent OR a page returns `< page_size` items (per plan §5.3 fallback).
   - For each release, calls `services/filter.apply_rules(release, config)` → keeps, drops, or flags.
   - De-dupes by `ocid` (keeps first occurrence).
   - Caches the response in memory for 60 s.
   - Returns the system spec §6.1 response shape.
6. `MatchList.tsx` receives the JSON, sorts by `closing_date` ascending, renders `MatchCard` per match.
7. Each `MatchCard` shows the flag pills, the metadata line, the closing-date line with the outbound link.

### 4.2 Config save

1. User edits a field in `ConfigForm.tsx`. Local component state updates.
2. User clicks Save. `ConfigForm.tsx` calls `putConfig(draftConfig)`.
3. `api/client.ts` issues `PUT /api/config` with the JSON body.
4. FastAPI route in `routes/config.py`:
   - Validates the body against the `Config` Pydantic model.
   - On invalid: returns 400 with a structured error. `ConfigForm.tsx` shows inline errors, Save stays enabled.
   - On valid: `config_store.save_config(config)` writes atomically (write to temp → rename). The in-memory cache is invalidated.
   - Returns 200 with the effective config.
5. `ConfigForm.tsx` shows the toast "Saved" and switches to the List tab.
6. `MatchList.tsx` remounts and calls `getMatches({ window: 30, includeClosed: true, bust: Date.now() })`. The `?bust=<ts>` param (per system spec §6.3) makes the cache key unique, forcing a fresh fetch.

### 4.3 Caching rules

- 60 s TTL on the response cache. Key = `SHA256(config_digest + window + include_closed)`.
- Cache is process-local. On backend restart, re-warms. Fine for one user.
- `?bust=<ts>` query param is a **cache bypass** (the route handler skips the cache lookup and always re-fetches); it is NOT part of the cache key.
- Upstream-down 503 with `cached_response: <last_good>` (per system spec §6.4) is the cache's *failure* mode — backend returns the last good response, frontend shows the amber banner.

### 4.4 Error handling

Per system spec §7:
- 5xx from eTenders → exponential backoff retry (1 s, 5 s, 25 s, 3 attempts). Exhaustion → 503 with `detail: upstream_unavailable` and any partial results. Cache is **not** poisoned.
- 429 from eTenders → respect `Retry-After` if present; else treat as 5xx.
- Config write failure (disk full, permission denied) → 500, previous config stays in effect, log.
- Frontend renders errors as text (XSS rule from system spec §8, hard rule).

**Why this flow shape:**
- The backend is the only thing that calls eTenders. Frontend never sees the upstream.
- The cache is keyed on config + window, not on user/session. One-user tool.
- The `?bust=<ts>` rule is a one-line solution to the "config change should reflect immediately" problem — no client state, no cache invalidation protocol.

## 5. Visual layer as the design spec

The seven Stitch screens at `Tender Watch/docs/superpowers/specs/2026-06-17-tender-watch-mockups-design/stitch-export/` are the visual spec for the React build. Specifically:

- The Tonal Spot color tokens (primary, secondary, tertiary, warning, neutral, error) and the Inter font family + 8 dp roundness are the **only** allowed values for the frontend's Tailwind `@theme` block. No ad-hoc colors.
- The seven screens map 1:1 to the seven React views. `MatchList.tsx` is the rendering of `list-with-results` / `list-zero-matches` / `list-upstream-down`. `ConfigForm.tsx` is the rendering of `config-default` / `config-validation-error`. `DetailDrawer.tsx` covers both detail-drawer screens. The empty state is a sub-component (`EmptyState.tsx`).
- Flag pills (HIGH-VALUE / CLOSES IN N DAYS / CLOSED) live in a single `FlagPill.tsx` component, with the color family and label text driven by the match's `flags` array.
- The seven Stitch screens were generated against Tonal Spot / Inter / 8 dp / Light. Tailwind v4 in the React build uses the same tokens. Same look, no translation step.

**Stitch quirks the React build should NOT inherit:**
- Stitch added a sidebar nav + top search bar to first-render screens. The React build should NOT include these. The actual chrome is the header + controls bar + list, per the system spec §6.2.
- Stitch added extra metadata placeholders (e.g. "Application period ended" instead of a closing-date line on closed cards). The React build should render the spec fields (`closing_date` ISO, `days_to_close` integer) directly. Use the design spec fields, not the Stitch interpretation.

## 6. Testing

Map the existing T1–T16 test cases from the planning repo's `2026-06-17-tender-watch.md` §4 to the two test frameworks.

### 6.1 Backend (pytest)

| ID | Test | Location |
| --- | --- | --- |
| T1 | First visit, default config → backend fetches last 30 days, applies defaults, returns matches | `tests/test_api.py::test_first_visit_default_config` |
| T2 | Visit with config that has 0 keywords and 0 buyers → 0 matches, `rejected_by_no_keyword_no_buyer` non-zero | `tests/test_filter.py::test_no_keywords_no_buyers` |
| T3 | eTenders 500 on page 2 → 503 with `upstream_unavailable`, cache not poisoned | `tests/test_api.py::test_upstream_500_returns_503` |
| T4 | Cache hit within TTL → second `GET /api/matches` does not re-fetch | `tests/test_cache.py::test_cache_hit_within_ttl` |
| T5 | Cache busted via `?bust=<ts>` → second fetch within TTL re-fetches | `tests/test_api.py::test_cache_bust_forces_refetch` |
| T6 | `PUT /api/config` with invalid JSON → 400, previous config remains | `tests/test_api.py::test_config_invalid_returns_400` |
| T7 | `PUT /api/config` with valid JSON → 200, persisted, list reflects new filters | `tests/test_api.py::test_config_save_and_refetch` |
| T8 | Cancelled tender → filtered out, never appears | `tests/test_filter.py::test_cancelled_tender_dropped` |
| T9 | No keyword match, no buyer match → filtered out | `tests/test_filter.py::test_no_keyword_no_buyer_dropped` |
| T10 | Release value R10m → match has `flags: ["high-value"]` | `tests/test_filter.py::test_high_value_flag` |
| T11 | Release closes in 2 days → match has `flags: ["closing-soon"]` | `tests/test_filter.py::test_closing_soon_flag` |
| T12 | Two releases with same `ocid` in same window → only one in response | `tests/test_filter.py::test_ocid_dedup` |
| T13 | Look-back window = 90 days → fetches wider window, `stats.releases_scanned` reflects it | `tests/test_api.py::test_lookback_90_days` |
| T16 | CORS preflight from disallowed origin → 403 | `tests/test_api.py::test_cors_disallowed_origin` |

**Backend-only (no T-number):**
- `test_config_store.py` — atomic write, defaults applied when file missing, file permissions, corrupt JSON recovery.
- `test_etenders.py` — pagination via recorded `sample_page.json`, `links.next` fallback when absent.

### 6.2 Frontend (Vitest + Testing Library)

| ID | Test | Location |
| --- | --- | --- |
| T14 | Frontend renders 25 matches → all 25 visible (no truncation) | `tests/MatchList.test.tsx::test_renders_all_matches` |
| T15 | Frontend receives 503 with `cached_response: null` → shows health banner + empty state | `tests/MatchList.test.tsx::test_upstream_down_with_no_cache` |
| — | Config form: invalid value shows inline error, Save stays enabled | `tests/ConfigForm.test.tsx::test_validation_error_blocks_save` |
| — | Config form: valid save shows toast, switches tab, triggers cache-bust fetch | `tests/ConfigForm.test.tsx::test_save_flow` |
| — | Detail drawer: click on card opens drawer, "View on eTenders" link is correct | `tests/DetailDrawer.test.tsx::test_drawer_opens_with_link` |
| — | `api/client.ts` wraps responses correctly, throws on non-2xx with parsed detail | `tests/api-client.test.ts` |
| — | `format.ts` formats ZAR correctly (R 12,500,000), handles null, missing currency | `tests/format.test.ts` |
| — | `relativeTime.ts` returns "in 2 days" / "closed" correctly for SAST | `tests/relativeTime.test.ts` |

**Mocks:**
- Backend: `respx` for httpx. Recorded fixtures `tests/fixtures/sample_release.json` (a single release) and `tests/fixtures/sample_page.json` (one paginated response). `TestClient` drives FastAPI without spinning up a real server.
- Frontend: `vi.mock('../api/client', ...)` to stub the API layer. `happy-dom` provides the DOM.

**What's NOT tested in v1:**
- The real eTenders API (only the recorded fixtures are used in tests). Real-API smoke test is the Phase 6 deploy verification.
- The deployed URL. Tested manually once.
- The Stitch screens. They're static HTML; manual review only.

## 7. Deployment (Phase 6)

### 7.1 Backend on Render

- Render Blueprint at `deploy/render.yaml` (free tier, `plan: free`, `region: oregon`).
- Build command: `pip install -e .[prod]`.
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1` (one worker is enough for a one-user tool).
- Health check path: `/api/health`.
- Env vars: `TW_API_BASE` (default `https://data.etenders.gov.za`), `TW_CONFIG_PATH` (default `./config/tender-watch.json`), `TW_CACHE_TTL_SECONDS=60`, `TW_ALLOWED_ORIGINS` (set to the deployed Vercel URL — see §7.3), `TW_LOG_LEVEL=INFO`, `PYTHON_VERSION=3.12`.
- Persistent disk: not needed in v1 (config is the only file written, and Render's free tier restarts wipe ephemeral disk — accept the wipe because Phase 6 step 4 says the backend creates the file from defaults on first run). Document this in the README.

### 7.2 Frontend on Vercel

- `deploy/vercel.json` with a rewrite from `/api/*` to the Render backend URL (so the frontend can call same-origin `/api/*` in prod, matching the dev proxy).
- Build command: `npm run build`. Output: `dist/`.
- Env var: `VITE_API_BASE` — leave unset in dev and prod (same-origin via Vite dev proxy or Vercel rewrite).
- Region: default `iad1`.

### 7.3 CORS (the wiring that needs to be exact)

- Backend's `TW_ALLOWED_ORIGINS` must include the deployed Vercel URL (e.g. `https://tender-watch-<random>.vercel.app`).
- Backend's CORS middleware reads `TW_ALLOWED_ORIGINS` at startup, parses the comma-separated list, and accepts only those origins. Unlisted origins get 403 on preflight (T16).
- Dev: `http://localhost:5173` is in the default `TW_ALLOWED_ORIGINS` value.

### 7.4 URL protection (random subdomain)

- Render gives the backend a subdomain like `tender-watch-api-<random>.onrender.com`. That's the protection — long, unguessable.
- Vercel gives the frontend `tender-watch-<random>.vercel.app`. Same.
- The README documents the random-subdomain approach as the v1 protection (per system spec §8 option 1).
- No auth, no reverse proxy, no Cloudflare. Documented in README; can be upgraded to HTTP basic auth or Cloudflare Access in v1.1.

### 7.5 Deploy workflow

1. Push to a GitHub repo (the implementer creates `tender-watch` under Ed's GitHub account).
2. Connect Render to the repo, point at `backend/`, use `deploy/render.yaml`.
3. Connect Vercel to the repo, point at `frontend/`, use `deploy/vercel.json`.
4. On first deploy, Render creates the config from defaults (system spec §6.2: "the backend creates the file on first write"). Ed edits via the UI.
5. Verify CORS: open the Vercel URL in a browser, confirm the list loads. If not, check `TW_ALLOWED_ORIGINS` on Render.

**What's NOT in v1 deploy:**
- CI/CD. Manual `git push` → auto-deploy via Render + Vercel git integration.
- Custom domain. The random subdomain is the protection.
- Monitoring / alerting. Ed notices via the health banner.

## 8. Open items to confirm during build

| Item | Source | Handling in this build |
| --- | --- | --- |
| Real production page-size ceiling | plan §5.1 | Default 100. Log on first real fetch. Adjust if 429s appear. |
| Rate-limit behaviour | plan §5.2 | 60 s cache. Widen TTL if rate-limited in practice. |
| `links.next` reliability | plan §5.3 | Use `PageNumber` increment until page returns `< PageSize` items, regardless of `links.next`. |
| Backend rendering of value in ZAR | plan §5.6 | `lib/format.ts` handles `null` / `0` / missing currency → default to ZAR. Backend formats to `value_display` string in Pydantic. |
| Closing-date timezone | plan §5.7 | Backend stores UTC ISO-8601. Frontend `format.ts` converts to SAST (UTC+2) for display. `Intl.DateTimeFormat` with `timeZone: 'Africa/Johannesburg'`. |
| OCDS licence review | plan §5.8 | Re-publish under Public Domain Dedication Licence. Confirmed at the spec level; legal review is a v1.1 task if Ed ever republishes publicly. |
| Look-back window default | scope.md "Open questions" #5 | 30 days default, configurable. No change. |
| Closing-date filtering for closed tenders | scope.md "Open questions" #4 | Include with `closed` flag, configurable via `include_closed` toggle. Already in system spec §4.3 / §5.2. |
| CORS exact origins | system spec §8 | Set via `TW_ALLOWED_ORIGINS` env var on Render. Documented in §7.3. |
| ZAR locale formatting | (new) | `Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' })` — gives "R 12,500,000" natively. |
| SAST timezone | (new) | `Africa/Johannesburg` for `Intl.DateTimeFormat` (SAST is UTC+2 year-round, no DST). |

## 9. Out of scope (v1)

- Bid writing, document generation, submission automation. (scope.md "Out of scope")
- Other tender portals (eTenders Portal, SARS, municipal sites). Future versions.
- User accounts, mobile push, Slack/Teams, email digest. (scope.md "Out of scope")
- Bidirectional sync with a CRM.
- Historical persistence — every page load is a fresh fetch. (scope.md "Out of scope")
- AI/ML ranking beyond simple keyword + buyer match.
- Multi-user access, invites, sharing beyond handing out the URL.
- CI/CD pipelines. (v1.1)
- Dark mode, mobile, animations, accessibility audit. (v1.1)
- Custom domain, monitoring, alerting. (v1.1)

## 10. Definition of done (matches scope success criteria + plan §6)

- [ ] All 16 behaviour-level test cases (T1–T16) pass.
- [ ] Frontend loads in <5 s end-to-end on a typical home connection (30-day window).
- [ ] All matches from the configured window are visible, each with the system spec §6.2 fields.
- [ ] One-week manual cross-check with the eTenders portal confirms no missed matching releases.
- [ ] False-positive rate < 30% over the first month (Ed's subjective call).
- [ ] Ed can edit keyword and buyer lists from the UI without redeploying.
- [ ] Fresh-clone deploy is reproducible from repo + env vars alone.
- [ ] URL-protection choice (random subdomain) documented in the README.
- [ ] `README.md` documents: how to run backend + frontend locally, how to deploy, how to edit the config, how to interpret the run stats.
- [ ] `LICENSE` is MIT.
- [ ] Visual layer (seven Stitch screens) referenced in the frontend's `styles.css` and component structure.
