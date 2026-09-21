# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Tender Watch is a personal, on-demand browser tool that monitors the South African eTenders OCDS Public API and surfaces IT / professional-services opportunities matching a user-defined keyword + buyer-allowlist filter. There is no auth and no scheduled job on the app itself — but as of v0.2 the data path has changed: a **nightly n8n workflow syncs eTenders releases into Postgres**, and the backend reads from that database on the request path, making `/api/matches` return in ~300ms instead of 70s+ against the live API. When `TW_DATABASE_URL` is empty (local dev), the backend falls back to the old live-fetch behaviour. The only persistent state is the Postgres tables (`tenders`, `sync_runs` — written by n8n only) and a small user-editable JSON config on the backend's filesystem.

Single self-hosted origin: `https://watch.titan-ai.co.za`, hosted on the shared xneelo nginx VPS at `156.38.222.220` (same box as `app/api/n8n.titan-ai.co.za` and the Postgres instance). nginx terminates TLS (Let's Encrypt via `certbot --nginx`), serves the Vite `dist/`, and reverse-proxies `/api/*` to uvicorn on `127.0.0.1:8001`; `systemd` supervises uvicorn. The subdomain is the only protection — there is no application-layer auth.

## v0.2 data + AI architecture (current live state)

- **Nightly sync** — n8n workflow "Tender Watch - Nightly eTenders Sync" (id `yP7LawN9dyJyVnA8`, active, 00:17 UTC daily) fetches the last 7 days of eTenders releases, upserts them into the `tenders` table (`ocid` PK, raw release JSON, `release_date`), and records each run in `sync_runs`. Sends WhatsApp success/failure alerts.
- **Daily digest** — n8n workflow "Tender Watch - Daily Digest Email" (id `Inj8r3kjufB8XL1d`, active, 07:00 daily) reads config + tenders, builds an HTML digest, and emails it: To `jone@riskdiversion.co.za`, CC `peter@riskdiversion.co.za` + `trinity@riskdiversion.co.za`, from `tenderwatch@titan-ai.co.za` (SMTP credential in n8n).
- **Backend DB path** — `routes/matches.py` `_fetch_raw()` reads from Postgres via `services/db.py` when `TW_DATABASE_URL` is set (production), else falls back to the live eTenders client. The DB module only ever reads; n8n owns all writes.
- **Claude features** (`TW_ANTHROPIC_API_KEY`): `services/heading.py` generates 2–5 word match headings (Haiku, cached per-ocid in-process); `services/summary.py` produces executive summaries of a tender's first PDF (Sonnet, native PDF support); `routes/matches.py` proxies tender PDFs same-origin with `Content-Disposition: inline` (eTenders forces attachment, so a plain `target="_blank"` can't render in-tab).
- **Postgres connection** — `tender_watch` database at `156.38.222.220:5432`, user `tender_watch_app` (app read credential). The n8n sync uses its own write-scoped credential.

## Repository layout

```
backend/   Python 3.12+ / FastAPI / Pydantic v2 / httpx + asyncpg (eTenders client, Postgres reader, filter pipeline, Claude services)
frontend/  Vite + React 19 + TypeScript + Tailwind v4 (SPA, five views: List, Regions, Briefings, Config + detail drawer)
deploy/    nginx vhost (nginx/), systemd unit, install.sh (first-time + updates, idempotent), deploy.sh (updates from a Linux laptop)
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
# macOS / Linux:
.venv/bin/pip install -e ".[dev,prod]"
.venv/bin/python -m uvicorn app.main:app --port 8000
```

### Frontend (dev)

```bash
cd frontend
npm install
npm run dev    # http://localhost:5173 — Vite proxies /api/* → http://127.0.0.1:8000
```

### Tests

```bash
# Backend — 46 tests, pytest + respx + pytest-asyncio (asyncio_mode = "auto")
cd backend
.venv\Scripts\python -m pytest -v
.venv\Scripts\python -m pytest tests/test_filter.py -v          # one file
.venv\Scripts\python -m pytest tests/test_api.py::test_x -v      # single test

# Frontend — 55 tests, Vitest + @testing-library/react
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

Single self-hosted origin. See `deploy/README.md` for the full runbook.

- **First-time setup** (run once on the host with `sudo`):
  ```bash
  ssh user@<host-ip>
  cd <repo-root>
  sudo bash deploy/install.sh
  ```
- **Updates** (run from the laptop):
  ```bash
  bash deploy/deploy.sh                # uses $TW_DEPLOY_HOST or the A record
  TW_DEPLOY_HOST=tender-watch@1.2.3.4 bash deploy/deploy.sh
  ```
- Install script is idempotent. A record for `watch.titan-ai.co.za` must already point at `156.38.222.220`.

### Deploy lane actually in use (2026-09-21, Windows laptop)

`deploy.sh` needs bash+rsync, which this Windows laptop does not have. The working lane is: **push to GitHub → Ed pulls on the host (Nexus SSH terminal) → re-run install.sh**:

```bash
cd ~/TenderWatch
git pull origin main
sudo systemctl stop tender-watch-backend   # install.sh preflight aborts if :8001 is busy
sudo bash deploy/install.sh
sudo systemctl start tender-watch-backend
```

Host gotchas discovered the hard way:
- The host's HTTPS credential to the private repo (`ASGAS-TeamDev/TenderWatch`) is dead — `git pull origin main` silently fails and install.sh rebuilds OLD code. Pull via the temporary public mirror (`git pull https://github.com/ASGAS-TeamDev/tenderwatch-deploy-mirror.git main`) until a read-only deploy key is added to the private repo.
- `install.sh` appends empty `TW_DATABASE_URL=` / `TW_ANTHROPIC_API_KEY=` lines to `/etc/tender-watch/backend.env` on re-runs (`ensure_env_key`). Fill them with `sudo tee -a` / `sed` — empty `TW_DATABASE_URL` silently falls back to the slow live eTenders fetch (symptom: `/api/health` shows `"last_synced_at": null` and `/api/matches` takes 70s+).
- Deploy verification triple: `/api/health` has a populated `last_synced_at`, `/api/matches` returns in <2s, and the served JS bundle is byte-identical to `frontend/dist/assets/*.js`.

## Architecture — backend

`backend/app/main.py` — FastAPI app. Mounts CORS (allowlist via `TW_ALLOWED_ORIGINS`, methods `GET/PUT/OPTIONS` only), wires three routers. In the self-hosted prod deployment `TW_ALLOWED_ORIGINS` is empty (same-origin behind nginx), so CORS is effectively a no-op there.

Three routers, all under `/api/`:

- `routes/health.py` — `GET /api/health` probes eTenders with `PageSize=1`, returns `etenders_reachable` + `config_path` + `last_synced_at` (from `sync_runs` when the DB is configured; the field's presence in the response also acts as a new-backend fingerprint).
- `routes/config.py` — `GET|PUT /api/config` reads/writes the on-disk JSON via `config_store.py` (atomic write: tempfile + `os.replace`). The PUT returns the new `config_digest` (sha256 of sorted JSON, first 16 hex).
- `routes/matches.py` — the workhorse:
  - `GET /api/matches?window=&include_closed=&bust=&show_all=` — splits caching into two layers: `_cache` (TTLCache of raw releases keyed only by `(window, page_size)`) + fresh per-request filtering. Stale-while-revalidate serving; `bust` forces a synchronous re-fetch; `show_all` bypasses keyword/buyer filtering. Data comes from Postgres (`_fetch_raw_db`) when `TW_DATABASE_URL` is set, else live eTenders (`_fetch_raw_live`, exponential backoff 1s/5s/25s on 5xx). On upstream exhaustion returns 503 with the last-good `MatchesResponse` as `cached_response` (JSON-serialized — raw datetimes would 500).
  - `GET /api/matches/{ocid}/summary` — Claude executive summary of the tender's first PDF (503/502 on missing config/documents).
  - `GET /api/matches/{ocid}/documents/{index}/view` — same-origin PDF proxy with `Content-Disposition: inline`.
  - `warm_default_cache()` — pre-warms at startup + on a recurring half-TTL schedule (see `main.py` lifespan), so the first user after a restart never pays the cold fetch.

Services:

- `services/etenders.py` — async httpx client. Base URL `https://ocds-api.etenders.gov.za` (was `data.etenders.gov.za`; relocated — see file docstring). Endpoint `/api/OCDSReleases?dateFrom&dateTo&PageNumber&PageSize`. Follows `links.next` if present (absolute URL verbatim), else increments `PageNumber`; stops on short page or no link. Capped at 200 pages as an infinite-loop guard. Per-page retry with backoff (2s/8s/20s) on 5xx.
- `services/db.py` — asyncpg read-only access to the n8n-synced `tenders` / `sync_runs` tables. Lazy process-lifetime pool; no-op when `TW_DATABASE_URL` is empty. **Never writes** — all writes belong to the n8n sync (separate credential).
- `services/cache.py` — generic `TTLCache[K, V]`. Uses `time.monotonic`, single-flight via per-key `asyncio.Lock` (only one loader call in flight per key), re-captures `now` after the loader finishes so the TTL window starts at completion.
- `services/filter.py` — implements spec §4. Hard-reject on `status ∈ {cancelled, unsuccessful, withdrawn}` or empty title. Soft-keep: match keywords against the **title + description + items[].classification.description** (eTenders titles are often procurement IDs), and/or buyer allowlist (case-insensitive, checks both `release.buyer.name` and `tender.buyer.name` and `procuringEntity.name`). Flags: `high-value` (≥ `high_value_threshold_zar`), `closing-soon` (≤ `closing_soon_days`), `closed` (only when `include_closed=True`), briefing flags. Treats `amount=0` as "not published" — returns `null` and renders `R —`.
- `services/heading.py` — Claude Haiku 2–5 word match headings, cached per-ocid (year-long TTL). Returns `""` when `TW_ANTHROPIC_API_KEY` is unset or the call fails — never blocks the response.
- `services/summary.py` — Claude Sonnet executive summary of a tender's first PDF (native Messages-API document support). Raises `SummaryError` for user-facing failures.

`models.py` is the single source of truth for the API contract. `Config` and `Match` constraints are Pydantic `Field(ge=, le=)` validators; the `Config` defaults are the source for the frontend's `KEYWORD_DEFAULTS` / `BUYER_DEFAULTS` constants.

`settings.py` — `pydantic_settings.BaseSettings` with `env_prefix="TW_"`. Process-wide singleton: `settings = Settings()`.

## Architecture — frontend

`frontend/src/main.tsx` mounts `<App />`. `App.tsx` is a top-level state machine: `view: "list" | "regions" | "briefings" | "config"`, `health`, `config`, `data`, `selected`, `toast`, `bust`. On `view==="list" && config`, it auto-loads matches; on `handleConfigSaved` it bumps `bust = Date.now()` so the matches refetch against the new filter.

`api/client.ts` — single typed wrapper around `fetch`. Reads `import.meta.env.VITE_API_BASE` at build time; in dev the Vite proxy means it's left empty (relative URL). 180s `AbortController` timeout (bump if windows grow) → user-friendly error message on cold start. The TypeScript interfaces (`Config`, `Match`, `MatchesResponse`, etc.) mirror `backend/app/models.py` exactly.

Views: `MatchList` (cards with flag pills + UpstreamBanner when `health.etenders_reachable` is false), `RegionsView` (province breakdown), `BriefingsCalendar` (upcoming briefing sessions), `DetailDrawer` (overlay; includes `ExecutiveSummaryModal` — Claude summarises the tender's first PDF via `/api/matches/{ocid}/summary`), `ConfigForm` (PUTs to `/api/config`; keyword + buyer checkboxes, favourites). Shared chrome: `Tabs`, `HealthChip`, `HealthBanner`, `EmptyState`, `FlagPill`, `Toast`, `LoadingModal`.

Lib: `lib/format.ts` (`formatZAR`, "R 12,500,000" en-ZA style), `lib/relativeTime.ts`, `lib/matchFilters.ts` (client-side search / province / status narrowing — mirrors backend `apply_rules` semantics, keeps the UI snappy between refetches). All API strings are rendered as text — XSS-safe by construction.

`vite.config.ts` proxies `/api → http://127.0.0.1:8000` for dev. In prod, nginx reverse-proxies `/api/*` to `127.0.0.1:8001`. The Vite/Vitest config is unified (single `vite.config.ts`, `test.environment = "happy-dom"`).

## Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `TW_API_BASE` | `https://ocds-api.etenders.gov.za` | eTenders OCDS base URL (was `data.etenders.gov.za`; see `services/etenders.py` docstring) |
| `TW_CONFIG_PATH` | `./config/tender-watch.json` | User-editable filter/threshold JSON (prod: `/etc/tender-watch/config.json`) |
| `TW_CACHE_TTL_SECONDS` | `60` | In-memory response cache TTL |
| `TW_ALLOWED_ORIGINS` | (empty in prod / `http://localhost:5173` in dev) | Comma-separated CORS allowlist. In the self-hosted prod deployment, leave empty for same-origin |
| `TW_LOG_LEVEL` | `INFO` | Python logging level |
| `TW_DATABASE_URL` | (empty) | Postgres for the n8n-synced `tenders`/`sync_runs` tables. Empty = live eTenders fetch (dev). Set in prod for the fast DB path |
| `TW_ANTHROPIC_API_KEY` | (empty) | Claude API key for headings + executive summaries. Empty disables both features |
| `VITE_API_BASE` | (empty) | Frontend build-time API base; leave empty in dev (proxy), empty in prod (same-origin under nginx) |

Backend `.env.example` is the authoritative list of defaults. The user-editable config (keywords, buyer allowlist, lookback window, high-value threshold, etc.) is the JSON at `TW_CONFIG_PATH`, edited via the in-app **Config** tab or raw JSON. In dev you can edit it freely; in prod the install script seeds `/etc/tender-watch/config.json` and the in-app Config tab PUTs back to it (no restart needed — read fresh on every `/api/matches`).

## Conventions

- 2-space indent, UTF-8, LF line endings (`.editorconfig`). Python files: 4-space. Markdown: trim trailing whitespace off.
- Backend uses `from __future__ import annotations` in every module; type hints throughout.
- TypeScript strict mode, React 19, no class components.
- Tailwind v4 with design tokens lifted from a Stitch Tonal Spot / Inter / 8 dp theme (`frontend/src/styles.css` `@theme` block). No component library.
- Single-instance assumption: in-process TTL cache is acceptable because the spec deploys one backend process (move to Redis only on horizontal scale-out — see `docs/open-items.md`).
- All release strings are rendered as text in the frontend — never as HTML — so hostile upstream titles cannot inject markup.

## Spec & plan references

- Design (current): `docs/superpowers/specs/2026-06-24-drop-vercel-render-design.md` (self-hosting choice)
- Design (v0.1.0 history): `docs/superpowers/specs/2026-06-17-tender-watch-app-design.md`
- Implementation plan: `docs/superpowers/plans/2026-06-17-tender-watch-app.md` and `docs/superpowers/plans/2026-06-24-drop-vercel-render.md`
- Resolved open items: `docs/open-items.md` (everything tracked in scope/plan/spec §9, with file:line citations)
