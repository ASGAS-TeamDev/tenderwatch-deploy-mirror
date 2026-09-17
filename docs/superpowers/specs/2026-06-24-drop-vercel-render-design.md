# Drop Vercel and Render — design spec

**Status:** approved 2026-06-24.
**Replaces:** the Render + Vercel deployment described in
`docs/superpowers/specs/2026-06-17-tender-watch-app-design.md` §9 (hosting
choices) and `README.md` ("Deploy" + "Security & hardening" sections).

## 1. Goal

Move Tender Watch off the Vercel (frontend) + Render (backend) pair onto a
single self-hosted origin at a subdomain of the company domain, intended for
office use only. The **build stack** (Vite + React 19 + TypeScript + Tailwind
v4 on the frontend, FastAPI + Pydantic v2 on the backend) does not change.

## 2. Topology

One Linux host, one DNS name, two processes.

```
internet ──▶ :80 / :443  (Caddy, TLS termination)
                         │
                         ├─▶ /         → file_server(/var/www/tender-watch/)     (Vite dist/)
                         └─▶ /api/*    → reverse_proxy → 127.0.0.1:8000           (uvicorn, loopback only)
                                                          │
                                                          └─▶ https://ocds-api.etenders.gov.za   (upstream, runtime)
```

- **Subdomain.** `tender-watch.galactix.co.za`. Confirmed by the operator
  2026-06-24.
- **A record.** `tender-watch.galactix.co.za` → public IP of the host. Lowered
  TTL (300s) at least 24h before cutover so the DNS switch propagates in
  ≤5 min.
- **Caddy** terminates TLS, serves the static SPA at `/`, and reverse-proxies
  `/api/*` to uvicorn on loopback. Caddy auto-issues and renews a Let's Encrypt
  cert via the ACME HTTP-01 challenge on port 80.
- **uvicorn** runs on `127.0.0.1:8000` only — never reachable from off-host.
  Supervised by `systemd` as the `tender-watch` system user.
- **Persistent state.** One file: `/etc/tender-watch/config.json` (the
  user-editable filter / threshold JSON). Backed up by whatever the operator's
  existing backup policy is. No database, no cache file (cache is in-process).

## 3. What's the same vs. what changes

### 3.1 Build stack and code (unchanged)

- `frontend/package.json`, `vite.config.ts`, `eslint.config.js`, `tsconfig.json`
  — unchanged.
- `frontend/src/**` — unchanged.
- `backend/pyproject.toml`, `backend/app/**` — unchanged, with one
  micro-exception noted in §3.2.

### 3.2 Backend micro-changes

- **`backend/app/main.py`** — refactor to a `create_app(origins: list[str])`
  factory that conditionally attaches `CORSMiddleware` only when `origins` is
  non-empty. The module-level `app` continues to be constructed at import
  time using `settings.allowed_origins_list`, so uvicorn behaviour is
  unchanged for both dev and prod. The factory exists so the new test in §11
  can construct an app instance with `origins=[]` and assert the middleware
  isn't attached. Production deploy sets `TW_ALLOWED_ORIGINS=""` (same origin
  → no CORS), so the middleware is a no-op in prod. Dev on laptop keeps the
  existing `http://localhost:5173` default and the middleware behaves as
  today.
- **`backend/app/settings.py`** — no change. The `allowed_origins` default
  remains `http://localhost:5173` because that is the correct dev default.
- **`backend/tests/test_api.py`** — one new test asserting that with
  `TW_ALLOWED_ORIGINS=""` the CORS headers are not added to a cross-origin
  preflight (`OPTIONS /api/health` with an `Origin: https://attacker.example`
  header → response has no `Access-Control-Allow-Origin`).

### 3.3 Files added

- `deploy/Caddyfile` — Caddy v2 config for the site, reverse-proxy rules.
- `deploy/tender-watch-backend.service` — systemd unit for uvicorn.
- `deploy/install.sh` — one-time box setup.
- `deploy/deploy.sh` — subsequent updates (rsync + restart).
- `deploy/README.md` — rewritten runbook.

### 3.4 Files removed

- `deploy/render.yaml`
- `deploy/deploy-frontend.ps1`
- `frontend/vercel.json`

### 3.5 Files rewritten

- `README.md` — "Deploy" and "Security & hardening" sections rewritten for the
  new flow. The env-var table's `TW_ALLOWED_ORIGINS` row updates its purpose
  description (still optional; defaults to same-origin dev URL when unset).
- `.env.example` — `TW_CONFIG_PATH` default changes from
  `./config/tender-watch.json` to `/etc/tender-watch/config.json`.
  `TW_ALLOWED_ORIGINS` is documented as optional (defaults to empty in
  production).
- `docs/open-items.md` — new "Resolved by v0.2.0" block covering hosting,
  CORS, and TLS.

## 4. Runtime configuration

### 4.1 `/etc/tender-watch/backend.env` (written by `install.sh`)

```
TW_API_BASE=https://ocds-api.etenders.gov.za
TW_CONFIG_PATH=/etc/tender-watch/config.json
TW_CACHE_TTL_SECONDS=60
TW_ALLOWED_ORIGINS=
TW_LOG_LEVEL=INFO
```

Empty `TW_ALLOWED_ORIGINS` is intentional — same origin means CORS is not
needed. The backend's CORS middleware is skipped at startup when this is empty.

### 4.2 `/etc/tender-watch/config.json` (seeded by `install.sh`)

Starts as `Config()` defaults from `backend/app/models.py`. Operator customises
via the in-app **Config** tab after cutover, or by pasting an existing config
into the install script before running it.

### 4.3 Frontend env (build-time, unchanged)

`VITE_API_BASE` stays empty. In dev, the Vite proxy handles `/api/*`; in prod,
the page origin is the API origin because Caddy reverse-proxies `/api/*`.

## 5. Caddyfile shape

```
tender-watch.galactix.co.za {
    root * /var/www/tender-watch
    encode gzip zstd
    try_files {path} /index.html
    file_server

    @api path /api/*
    reverse_proxy @api 127.0.0.1:8000

    log {
        output file /var/log/caddy/tender-watch.log {
            roll_size 10mb
            roll_keep 5
        }
    }
}
```

- `try_files {path} /index.html` is the SPA rewrite. Same intent as the old
  `vercel.json` `rewrites`, expressed in Caddy syntax.
- `@api path /api/*` matches anything under `/api/` and proxies to loopback.
  Everything else is the static SPA.
- Logs roll at 10 MB, kept 5 files.

## 6. systemd unit shape

```
[Unit]
Description=Tender Watch backend (FastAPI)
After=network.target

[Service]
Type=simple
User=tender-watch
Group=tender-watch
WorkingDirectory=/opt/tender-watch/backend
EnvironmentFile=/etc/tender-watch/backend.env
ExecStart=/opt/tender-watch/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/etc/tender-watch
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

- `Restart=on-failure` with `RestartSec=3` — a backend crash comes back in 3s.
  The frontend's 90s `AbortController` timeout (see
  `frontend/src/api/client.ts`) absorbs the gap during a restart.
- `ProtectSystem=strict` + `ReadWritePaths=/etc/tender-watch` — the only
  writable directory at runtime is where the config JSON lives, so atomic
  writes still work and the rest of the FS is read-only.
- Logs go to the systemd journal. View with `journalctl -u tender-watch-backend`.

## 7. Install script flow (`deploy/install.sh`)

Run once per host as root: `sudo bash deploy/install.sh`. Idempotent: skips
steps that are already done.

1. **Pre-flight.** Verify the script is running as root. Resolve the public
   IP of the host and confirm an A record exists for
   `tender-watch.galactix.co.za` pointing at it (uses `getent hosts`).
   Refuse to continue if not.
2. **Packages.** Add Caddy's official Cloudsmith apt repo + keyring, then
   `apt-get install -y caddy python3.12 python3.12-venv python3-pip rsync`.
   (Operator swaps `apt-get` → `dnf` if the distro is RHEL-family — the
   script auto-detects.)
3. **System user.** `useradd --system --shell /usr/sbin/nologin --home-dir /opt/tender-watch tender-watch`.
4. **App directory.** `mkdir -p /opt/tender-watch /etc/tender-watch /var/www/tender-watch`.
5. **Backend venv.** `python3.12 -m venv /opt/tender-watch/backend/.venv`,
   `pip install -e ".[prod]"`. `chown -R tender-watch:tender-watch /opt/tender-watch`.
6. **Config seed.** Write `/etc/tender-watch/config.json` from `Config().model_dump_json(indent=2)`
   if the file doesn't already exist. Mode `0640`, owner `root:tender-watch`.
7. **Environment file.** Write `/etc/tender-watch/backend.env` from §4.1.
   Mode `0640`, owner `root:tender-watch`.
8. **SPA build.** `cd /opt/tender-watch/frontend && npm ci && npm run build`,
   copy `dist/` to `/var/www/tender-watch/`. Owner `www-data` (Caddy's user)
   so the file_server can read it.
9. **Caddy config.** Write `/etc/caddy/Caddyfile` from §5, with the real
   `tender-watch.galactix.co.za` baked in (no placeholder). `caddy validate`
   the result. Refuse to
   continue on validation failure.
10. **systemd unit.** Write `/etc/systemd/system/tender-watch-backend.service`
    from §6.
11. **Enable & start.** `systemctl daemon-reload && systemctl enable --now
    caddy && systemctl enable --now tender-watch-backend`.
12. **Wait for cert.** Loop for up to 60s checking `systemctl status caddy`
    and `journalctl -u caddy --since "1 min ago"` for a successful ACME issue.
    Print a clear failure message if it times out.
13. **Smoke test.** `curl -fsS https://tender-watch.galactix.co.za/api/health`.
    Print the result.
14. **Print summary.** Where the config file lives, how to view logs, how to
    deploy updates.

## 8. Deploy script flow (`deploy/deploy.sh`)

Run from a laptop with SSH access to the host:

```
bash deploy/deploy.sh [user@host]
```

Defaults `user@host` to whatever the operator exports as `TW_DEPLOY_HOST`,
falling back to `tender-watch@<host-ip>`, where `<host-ip>` is the same
public IP the A record points at (operator passes via the `$1` arg or by
setting the env var).

1. `rsync -az --delete frontend/dist/ $TW_DEPLOY_HOST:/var/www/tender-watch/`.
2. `rsync -az --delete --exclude .venv --exclude __pycache__ --exclude .pytest_cache --exclude .ruff_cache backend/ $TW_DEPLOY_HOST:/opt/tender-watch/backend/`.
3. `ssh $TW_DEPLOY_HOST "sudo systemctl restart tender-watch-backend && sudo systemctl status --no-pager tender-watch-backend"`.
4. Print "Deploy complete" and the URL.

Caddy is not restarted — it picks up the new `dist/` files on next request.
Backend restart is fine because the SPA handles the 3–5s gap with its 90s
client timeout and its retry-on-Refresh-↻ button.

## 9. Data flow (unchanged)

Same as today, with the reverse-proxy hop inserted:

1. Browser → `GET https://tender-watch.galactix.co.za/api/matches?window=…`
2. Caddy → `reverse_proxy` → `127.0.0.1:8000/api/matches?…`
3. uvicorn → `routes/matches.get_matches()` → `EtendersClient.fetch_releases()` → `apply_rules()`
4. uvicorn → JSON → Caddy → browser

## 10. Error handling

- **Backend crash.** `systemd` restarts in 3s. The SPA's 90s `AbortController`
  timeout (`frontend/src/api/client.ts`) covers the gap; the Refresh button
  forces a retry.
- **Caddy crash.** `systemd` (the distro's default unit for `caddy.service`)
  restarts in seconds. While down, the entire origin is unreachable.
- **Cert renewal failure.** Caddy retries automatically. If it persists >24h,
  the SPA still loads (HTTP-01 challenges don't block the site from serving
  with an existing cert).
- **Upstream eTenders unavailable.** Already handled —
  `backend/app/routes/matches.py` returns 503 with `cached_response` from
  `_last_good`. The frontend's `UpstreamBanner` surfaces this. Unchanged.
- **Disk full.** `journalctl` may start dropping entries; the SPA still
  serves. Config writes will fail with an `OSError` from
  `config_store.save_config` and surface as a 500 — operator can free space.

## 11. Testing

- **Existing backend tests pass unchanged.** The middleware change is exercised
  by the new CORS test.
- **Existing frontend tests pass unchanged.** No code changes on the frontend.
- **New backend test:** `test_api.py::test_cors_middleware_not_attached_when_origins_empty`.
  Because `app.main` is imported at module load (and the `client` fixture in
  `test_api.py` triggers that import), the test cannot rely on
  `monkeypatch.setenv` alone — the middleware would already be attached.
  Implementation: extract a `create_app()` factory in `app/main.py` (currently
  the module-level `app` is fine to keep for uvicorn); the test calls
  `create_app(origins="")` and asserts no `Access-Control-Allow-*` headers
  appear in response to a preflight from a foreign origin. The existing
  `test_cors_disallowed_origin` continues to cover the
  allowlist-with-disallowed-Origin case and remains untouched.
- **Manual smoke test** in step 13 of `install.sh` covers the runtime path.

## 12. Security

- **TLS.** Caddy auto-issued, A grade by default (Mozilla intermediate).
- **Auth.** None at the application layer. The unguessable subdomain is the
  only protection — same as the previous design.
- **Filesystem hardening.** systemd `ProtectSystem=strict` + `ReadWritePaths`
  confines the backend to writing only `/etc/tender-watch`. Caddy has no
  shell, only a `www-data` user that owns `/var/www/tender-watch`.
- **Loopback binding.** uvicorn binds `127.0.0.1:8000` — not reachable from
  off-host, even if the firewall is misconfigured.
- **No HTTP on 80.** Caddy redirects HTTP → HTTPS by default.

## 13. Cutover plan

1. **T-24h (operator).** Lower the TTL on `tender-watch.galactix.co.za` to
   300s.
2. **T-1h (operator).** Add the new A record pointing at the new host's IP.
   No traffic yet (nothing's listening on that IP from the box that *was*
   receiving Render/Vercel traffic).
3. **T-0 (operator runs install.sh).** `ssh` into the new host, `sudo bash
   deploy/install.sh`. Caddy issues the cert, backend comes up.
4. **T+5min (operator smoke test).** Open the URL in a browser. Verify health,
   matches load, config roundtrip. If broken, change the A record back to the
   old Render IP — Rollback completes in ≤5min.
5. **T+24h (operator).** Cancel the Render service and delete the Vercel
   project from each dashboard.
6. **T+24h+ (engineer).** Land the code changes (delete `vercel.json`,
   `render.yaml`, `deploy-frontend.ps1`; rewrite README; add the new deploy
   files). Single commit.

## 14. Rollback

Until step 5, the old Render + Vercel site is still live and reachable at
its previous URLs. Setting the A record back to the Render IP restores
service within the DNS TTL window (≤5min).

After step 5, rollback means: restore Render from a backup or rebuild — out of
scope for this spec. Render's free tier does not guarantee persistence, so
any rollback beyond ~30 days of cancelled service would need re-provisioning.

## 15. Out of scope

- Multi-host horizontal scale-out (still single-box).
- Authentication (still URL-only).
- Scheduled jobs / email digest (still not in v1).
- Backup automation for `/etc/tender-watch/config.json` (operator's existing
  backup policy applies).
- Caddy admin API exposure (off by default, unchanged).

## 16. Open items deferred to v0.3.0

- **Real production page-size ceiling probe.** Inherited from
  `docs/open-items.md`. Not affected by this change.