# Tender Watch

A personal, on-demand browser tool that monitors the South African eTenders
OCDS Public API and surfaces IT / professional-services opportunities matching
a user-defined keyword + buyer-allowlist filter.

There is no scheduled job, no email digest, and no database. Every page load
fetches fresh from `data.etenders.gov.za` over a sliding look-back window
(the backend keeps a short-lived in-memory response cache to smooth bursts).
The only persistent state is a small, user-editable JSON config on the
backend's filesystem.

## Architecture

- **Backend** (`backend/`) — Python 3.12+ / FastAPI / Pydantic v2 / httpx.
  Fetches releases from eTenders, applies the filter pipeline
  (hard-reject on status, soft-keep on keyword OR buyer, de-dupe by `ocid`,
  flag for high-value / closing-soon / closed), serves three endpoints
  (`GET /api/health`, `GET|PUT /api/config`, `GET /api/matches`), and caches
  responses in memory with a configurable TTL.
- **Frontend** (`frontend/`) — Vite + React 19 + TypeScript + Tailwind v4.
  Three views (List, Detail drawer, Config) plus shared chrome (tabs, health
  chip, banners, empty state, flag pills). Calls the backend through the
  `VITE_API_BASE` URL (or the Vite dev-server proxy in development).
- **Deploy** (`deploy/`) — Single self-hosted origin at
  `tender-watch.galactix.co.za`. Caddy terminates TLS (Let's Encrypt),
  serves the Vite `dist/`, and reverse-proxies `/api/*` to uvicorn on
  loopback; `systemd` supervises uvicorn. `install.sh` is first-time
  host setup; `deploy.sh` ships laptop → host updates. See
  `deploy/README.md` for the runbook.

Design spec: `docs/superpowers/specs/2026-06-24-drop-vercel-render-design.md`
(self-hosting choice). v0.1.0 design history:
`docs/superpowers/specs/2026-06-17-tender-watch-app-design.md`.

## Quick start

### Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\python -m pip install -e ".[dev,prod]"
# macOS / Linux:
.venv/bin/pip install -e ".[dev,prod]"

.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

Open `http://127.0.0.1:8000/api/health` to confirm the service is up.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api/*` to
`http://127.0.0.1:8000` (override with `VITE_API_BASE` if the backend runs
elsewhere).

## Tests

### Backend

```bash
cd backend
.venv\Scripts\python -m pytest -v
```

25 tests cover the eTenders client, filter pipeline (T8–T12), config store,
TTL cache (T4), the three API routes (T1, T2, T3, T5, T6, T7, T13, T16), and
the CORS middleware (skipped in production).

### Frontend

```bash
cd frontend
npx vitest run
```

21 tests cover the API client, format / relative-time helpers, the match list
(T14, T15), the detail drawer, and the config form.

### Lint + type check

```bash
# Backend
cd backend
.venv\Scripts\python -m ruff check .

# Frontend
cd frontend
npm run lint        # ESLint
npx tsc --noEmit    # TypeScript
```

### Production build

```bash
cd frontend
npm run build
```

Output is written to `frontend/dist/`.

## Configuration

All backend settings are loaded from environment variables (prefix `TW_`).
Defaults match `backend/.env.example`.

| Variable                  | Default                              | Purpose                                                  |
| ------------------------- | ------------------------------------ | -------------------------------------------------------- |
| `TW_API_BASE`             | `https://data.etenders.gov.za`       | eTenders OCDS Public API base URL                        |
| `TW_CONFIG_PATH`          | `./config/tender-watch.json`         | Where the user-editable filter / threshold JSON lives    |
| `TW_CACHE_TTL_SECONDS`    | `60`                                 | In-memory response cache TTL (seconds)                   |
| `TW_ALLOWED_ORIGINS`      | `http://localhost:5173`              | Comma-separated CORS origins (Render + Vercel URLs in prod) |
| `TW_LOG_LEVEL`            | `INFO`                               | Python logging level                                     |

Frontend:

| Variable          | Default                  | Purpose                                              |
| ----------------- | ------------------------ | ---------------------------------------------------- |
| `VITE_API_BASE`   | (empty → uses `/api/*`)  | When set, the SPA calls this base URL instead of the Vite dev-server proxy. In dev, leave it empty. In prod, set to the Render backend URL. |

The user-editable config (keywords, buyer allowlist, look-back window,
high-value threshold, etc.) lives in the JSON file at `TW_CONFIG_PATH`. It is
edited through the in-app **Config** tab; raw JSON edits also work.

## Deploy

Single-host deployment at `https://tender-watch.galactix.co.za`. Caddy
terminates TLS, serves the Vite `dist/`, and reverse-proxies `/api/*` to
uvicorn on loopback. `systemd` supervises uvicorn.

- `deploy/Caddyfile` — Caddy v2 site config (installed by `install.sh`).
- `deploy/tender-watch-backend.service` — systemd unit for uvicorn.
- `deploy/install.sh` — first-time host setup. Idempotent.
- `deploy/deploy.sh` — laptop -> host updates.

First-time setup:

```bash
# Add an A record: tender-watch.galactix.co.za -> <host public IP>
ssh user@<host-ip>
cd <repo-root>
sudo bash deploy/install.sh
```

Updates:

```bash
bash deploy/deploy.sh
```

See `deploy/README.md` for the full runbook (daily ops, backups,
teardown of the old Vercel + Render setup).

## Security & hardening

This is a personal tool intended to live on an unguessable subdomain
of `galactix.co.za`. No auth at the application layer — the
subdomain is the only protection. The host is hardened by:

- Caddy auto-issuing and renewing a Let's Encrypt TLS certificate
  (Mozilla "A" grade by default).
- uvicorn binding to `127.0.0.1:8000` only — never reachable from
  off-host, even if the firewall is misconfigured.
- `systemd ProtectSystem=strict` confining the backend process to
  writing only `/etc/tender-watch` (where the config JSON lives).

If the URL is ever shared more widely, recommended mitigations (out of
scope for v1) are: HTTP basic auth in front of Caddy, or Cloudflare
Access (Zero Trust) in front of the host.

The frontend never renders API content as HTML — every release string is
rendered as text, so even hostile upstream titles cannot inject markup.

## License

- **This code** — MIT. See `LICENSE`.
- **eTenders data** — the eTenders OCDS Public API publishes under the
  [Open Data Commons Public Domain Dedication and Licence (PDDL) 1.0][pddl].
  Re-publishing raw release data is permitted under that licence; a
  public-facing republishing site would need its own licence review.

[pddl]: https://opendatacommons.org/licenses/pddl/1-0/
