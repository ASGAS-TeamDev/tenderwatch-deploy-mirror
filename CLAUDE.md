# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Tender Watch is a personal, on-demand browser tool that monitors the South African eTenders OCDS Public API and surfaces IT / professional-services opportunities matching a user-defined keyword + buyer-allowlist filter. There is no scheduled job, no email digest, no database, and no auth. Every page load fetches fresh from `data.etenders.gov.za`. The only persistent state is a small user-editable JSON config on the backend's filesystem.

## Repository layout

```
backend/   Python 3.12+ / FastAPI / Pydantic v2 / httpx (eTenders client + filter pipeline)
frontend/  Vite + React 19 + TypeScript + Tailwind v4 (SPA, three views)
deploy/    render.yaml (backend) + vercel.json (frontend) + deploy-frontend.ps1 (one-shot Vercel deploy)
docs/      open-items.md, design spec + implementation plan under docs/superpowers/
```

## Commands

### Backend (dev)

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\python -m pip install -e ".[dev,prod]"
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

### Frontend (dev)

```bash
cd frontend
npm install
npm run dev    # http://localhost:5173 — Vite proxies /api/* → http://127.0.0.1:8000
```

### Tests

```bash
# Backend — 24 tests, pytest + respx + pytest-asyncio (asyncio_mode = "auto")
cd backend
.venv\Scripts\python -m pytest -v
.venv\Scripts\python -m pytest tests/test_filter.py -v          # one file
.venv\Scripts\python -m pytest tests/test_api.py::test_x -v      # single test

# Frontend — 21 tests, Vitest + @testing-library/react
cd frontend
npx vitest run
npx vitest run tests/format.test.ts                             # one file
```

### Lint + type check

```bash
# Backend
cd backend
.venv\Scripts\python -m ruff check .

# Frontend
cd frontend
npm run lint        # ESLint v9 flat config
npx tsc --noEmit    # TypeScript
```

### Production build

```bash
cd frontend
npm run build       # → frontend/dist/
```

### Deploy

- Backend: `render.yaml` (Render Blueprint; `rootDir: backend`, health check at `/api/health`).
- Frontend: `vercel.json` lives in `frontend/` (Vite framework, SPA rewrites). One-shot script: `deploy\deploy-frontend.ps1` (installs Vercel CLI, handles login, sets `VITE_API_BASE`, runs `vercel --prod`).
- After a Vercel first deploy, copy the URL into the Render service's `TW_ALLOWED_ORIGINS` env var (Render auto-redeploys). First Render request cold-starts ~60s.

## Architecture — backend

`backend/app/main.py` — FastAPI app. Mounts CORS (allowlist via `TW_ALLOWED_ORIGINS`, methods `GET/PUT/OPTIONS` only), wires three routers.

Three routes, all under `/api/`:

- `routes/health.py` — `GET /api/health` probes eTenders with `PageSize=1`, returns `etenders_reachable` + `config_path`.
- `routes/config.py` — `GET|PUT /api/config` reads/writes the on-disk JSON via `config_store.py` (atomic write: tempfile + `os.replace`). The PUT returns the new `config_digest` (sha256 of sorted JSON, first 16 hex).
- `routes/matches.py` — `GET /api/matches?window=&include_closed=&bust=` is the workhorse:
  - Loads config, computes `config_digest`, derives a cache key `(digest, window, effective_include_closed)`.
  - Honors `bust` (any non-null value forces re-fetch without touching the cache).
  - Calls `EtendersClient.fetch_releases()` with exponential backoff (1s/5s/25s, 3 attempts) on 5xx; 4xx / network errors fail fast.
  - On 503 exhaustion, returns the last-good `MatchesResponse` as `cached_response`.
  - Runs `apply_rules(release, config, now=…)` per release, dedupes by `ocid`, tallies stats, returns `MatchesResponse`.

Two services:

- `services/etenders.py` — async httpx client. Base URL `https://ocds-api.etenders.gov.za` (was `data.etenders.gov.za`; relocated — see file docstring). Endpoint `/api/OCDSReleases?dateFrom&dateTo&PageNumber&PageSize`. Follows `links.next` if present (absolute URL verbatim), else increments `PageNumber`; stops on short page or no link. Capped at 200 pages as an infinite-loop guard.
- `services/cache.py` — generic `TTLCache[K, V]`. Uses `time.monotonic`, single-flight via per-key `asyncio.Lock` (only one loader call in flight per key), re-captures `now` after the loader finishes so the TTL window starts at completion.
- `services/filter.py` — implements spec §4. Hard-reject on `status ∈ {cancelled, unsuccessful, withdrawn}` or empty title. Soft-keep: match keywords against the **title + description + items[].classification.description** (eTenders titles are often procurement IDs), and/or buyer allowlist (case-insensitive, checks both `release.buyer.name` and `tender.buyer.name` and `procuringEntity.name`). Flags: `high-value` (≥ `high_value_threshold_zar`), `closing-soon` (≤ `closing_soon_days`), `closed` (only when `include_closed=True`). Treats `amount=0` as "not published" — returns `null` and renders `R —`.

`models.py` is the single source of truth for the API contract. `Config` and `Match` constraints are Pydantic `Field(ge=, le=)` validators; the `Config` defaults are the source for the frontend's `KEYWORD_DEFAULTS` / `BUYER_DEFAULTS` constants.

`settings.py` — `pydantic_settings.BaseSettings` with `env_prefix="TW_"`. Process-wide singleton: `settings = Settings()`.

## Architecture — frontend

`frontend/src/main.tsx` mounts `<App />`. `App.tsx` is a top-level state machine: `view: "list" | "config"`, `health`, `config`, `data`, `selected`, `toast`, `bust`. On `view==="list" && config`, it auto-loads matches; on `handleConfigSaved` it bumps `bust = Date.now()` so the matches refetch against the new filter.

`api/client.ts` — single typed wrapper around `fetch`. Reads `import.meta.env.VITE_API_BASE` at build time; in dev the Vite proxy means it's left empty (relative URL). 90s `AbortController` timeout → user-friendly error message on cold start. The TypeScript interfaces (`Config`, `Match`, `MatchesResponse`, etc.) mirror `backend/app/models.py` exactly.

Three views: `MatchList` (cards with flag pills + UpstreamBanner when `health.etenders_reachable` is false), `DetailDrawer` (overlay), `ConfigForm` (PUTs to `/api/config`). Shared chrome: `Tabs`, `HealthChip`, `HealthBanner`, `EmptyState`, `FlagPill`, `Toast`.

Lib: `lib/format.ts` (`formatZAR`, "R 12,500,000" en-ZA style) and `lib/relativeTime.ts`. All API strings are rendered as text — XSS-safe by construction.

`vite.config.ts` proxies `/api → http://127.0.0.1:8000` for dev. The Vite/Vitest config is unified (single `vite.config.ts`, `test.environment = "happy-dom"`).

## Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `TW_API_BASE` | `https://ocds-api.etenders.gov.za` | eTenders OCDS base URL |
| `TW_CONFIG_PATH` | `./config/tender-watch.json` | User-editable filter/threshold JSON |
| `TW_CACHE_TTL_SECONDS` | `60` | In-memory response cache TTL |
| `TW_ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated CORS allowlist (prod: Vercel + Render URLs) |
| `TW_LOG_LEVEL` | `INFO` | Python logging level |
| `VITE_API_BASE` | (empty) | Frontend build-time API base; leave empty in dev, set to Render URL in prod |

Backend `.env.example` is the authoritative list of defaults. The user-editable config (keywords, buyer allowlist, lookback window, high-value threshold, etc.) is the JSON at `TW_CONFIG_PATH`, edited via the in-app **Config** tab or raw JSON.

## Conventions

- 2-space indent, UTF-8, LF line endings (`.editorconfig`). Python files: 4-space. Markdown: trim trailing whitespace off.
- Backend uses `from __future__ import annotations` in every module; type hints throughout.
- TypeScript strict mode, React 19, no class components.
- Tailwind v4 with design tokens lifted from a Stitch Tonal Spot / Inter / 8 dp theme (`frontend/src/styles.css` `@theme` block). No component library.
- Single-instance assumption: in-process TTL cache is acceptable because the spec deploys one Render instance (move to Redis only on horizontal scale-out — see `docs/open-items.md`).
- All release strings are rendered as text in the frontend — never as HTML — so hostile upstream titles cannot inject markup.

## Spec & plan references

- Design: `docs/superpowers/specs/2026-06-17-tender-watch-app-design.md`
- Implementation plan: `docs/superpowers/plans/2026-06-17-tender-watch-app.md`
- Resolved open items: `docs/open-items.md` (everything tracked in scope/plan/spec §9, with file:line citations)
