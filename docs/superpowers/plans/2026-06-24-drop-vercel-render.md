# Drop Vercel and Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Vercel (frontend) + Render (backend) deployment with a single self-hosted origin at `https://tender-watch.galactix.co.za` served by Caddy, with the FastAPI backend supervised by systemd on loopback. The build stack (Vite + React, FastAPI) is unchanged.

**Architecture:** One host. Caddy terminates TLS (auto-issued via Let's Encrypt), serves the static Vite `dist/` at `/`, and reverse-proxies `/api/*` to `uvicorn` on `127.0.0.1:8000`. `systemd` supervises uvicorn as the `tender-watch` system user. The frontend makes same-origin requests, so CORS is intentionally disabled in production. Only the deploy artefacts change; no feature code changes.

**Tech Stack:** Backend — FastAPI / Pydantic v2 / pytest / respx. Frontend — Vite 6 / React 19 / TypeScript / Tailwind v4 / Vitest. Runtime — Caddy v2 (TLS + reverse proxy), systemd, bash.

**Spec:** `docs/superpowers/specs/2026-06-24-drop-vercel-render-design.md`

---

## Task ordering rationale

Tasks 1–3 land the backend micro-changes (test first, then refactor, then verify). Tasks 4–8 add the new deploy artefacts (Caddyfile, systemd unit, install script, deploy script, README runbook). Tasks 9–12 handle the code/doc cleanup (file deletions, README rewrite, `.env.example` rewrite, open-items.md update). Task 13 is the end-to-end manual smoke check. Each task ends in a single commit.

## Conventions

- All commands run from the repo root unless noted.
- Use PowerShell-friendly paths (Windows dev environment); bash for the deploy scripts themselves.
- Commit messages follow `type(scope): summary` (feat / chore / docs / test / fix).
- Every commit ends with a clean working tree (`git status` shows nothing).

---

## Task 1: Backend — write the failing CORS test

**Files:**
- Modify: `backend/tests/test_api.py:1-15` (imports)

- [ ] **Step 1: Read the existing test file to confirm imports and fixture structure**

Open `backend/tests/test_api.py`. Note line 12 (`from app.main import app`) and the `_reset_matches_cache` autouse fixture at lines 21–35.

- [ ] **Step 2: Add the new test at the bottom of `backend/tests/test_api.py`**

Append the following code to the end of the file (do not modify any existing test):

```python
def test_cors_middleware_not_attached_when_origins_empty(tmp_path, monkeypatch) -> None:
    """When origins=[], CORSMiddleware must not be installed at all.

    We assert against the absence of CORS response headers rather than
    checking the middleware list, because middleware introspection from
    a TestClient is fragile.
    """
    # Lazy-import create_app so the test can supply origins=[] without
    # the module-level app's middleware list leaking into our check.
    from app.main import create_app

    cfg_path = tmp_path / "cors-test.json"
    cfg_path.write_text("{}", encoding="utf-8")
    monkeypatch.setattr("app.settings.settings.config_path", str(cfg_path))

    test_app = create_app(origins=[])
    # Sanity: the route is wired up.
    from fastapi.testclient import TestClient

    client = TestClient(test_app)
    # Preflight from a foreign origin.
    resp = client.options(
        "/api/health",
        headers={
            "Origin": "https://attacker.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    # No CORS headers when the middleware is absent.
    assert "access-control-allow-origin" not in {k.lower() for k in resp.headers}
    assert "access-control-allow-methods" not in {k.lower() for k in resp.headers}
```

- [ ] **Step 3: Run the new test to verify it fails**

Run:
```bash
cd backend
.venv\Scripts\python -m pytest tests/test_api.py::test_cors_middleware_not_attached_when_origins_empty -v
```

Expected: FAIL with `ImportError: cannot import name 'create_app' from 'app.main'`. The failure proves the test exercises the new code path.

- [ ] **Step 4: Commit the failing test**

```bash
cd ..
git add backend/tests/test_api.py
git commit -m "test(backend): add failing test for CORS middleware absence

When origins=[] (production same-origin deploy), CORSMiddleware should
not be attached at all. The existing test_cors_disallowed_origin covers
the allowlist case; this covers the new 'same-origin is the default'
case called for by the drop-vercel-render spec.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Backend — implement `create_app` factory

**Files:**
- Modify: `backend/app/main.py` (replace the entire file)

- [ ] **Step 1: Replace `backend/app/main.py` with the factory refactor**

Overwrite the file with this content:

```python
"""FastAPI entry point."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import config as config_routes
from app.routes import health as health_routes
from app.routes import matches as matches_routes
from app.settings import settings


def create_app(origins: list[str] | None = None) -> FastAPI:
    """Construct the FastAPI app.

    Args:
        origins: CORS allowlist. If empty (or None), CORSMiddleware is not
            attached — the deployment is expected to be same-origin
            (Caddy reverse-proxying /api/* in front of this process).
            Pass a non-empty list when serving cross-origin (e.g. local
            dev where the SPA runs on a different port).
    """
    if origins is None:
        origins = settings.allowed_origins_list
    app = FastAPI(title="Tender Watch", version="0.2.0")
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=False,
            allow_methods=["GET", "PUT", "OPTIONS"],
            allow_headers=["*"],
        )
    app.include_router(health_routes.router)
    app.include_router(matches_routes.router)
    app.include_router(config_routes.router)
    return app


# Configure logging once at import time (matches prior behaviour).
logging.basicConfig(level=settings.log_level)

# Module-level app for uvicorn. Pass --origins via TW_ALLOWED_ORIGINS env var
# in dev (default: http://localhost:5173) or set TW_ALLOWED_ORIGINS="" in
# production for same-origin (no CORS middleware attached).
app = create_app()
```

- [ ] **Step 2: Run the new test to verify it passes**

Run:
```bash
cd backend
.venv\Scripts\python -m pytest tests/test_api.py::test_cors_middleware_not_attached_when_origins_empty -v
```

Expected: PASS.

- [ ] **Step 3: Run the entire backend test suite to confirm no regressions**

Run:
```bash
.venv\Scripts\python -m pytest -v
```

Expected: all 24 prior tests still pass, plus the 1 new test = 25 total passing.

- [ ] **Step 4: Run ruff to confirm no lint regressions**

Run:
```bash
.venv\Scripts\python -m ruff check .
```

Expected: clean exit, no diagnostics.

- [ ] **Step 5: Commit the refactor**

```bash
cd ..
git add backend/app/main.py
git commit -m "refactor(backend): extract create_app() factory, version 0.2.0

Replaces the module-level CORSMiddleware with a factory that only
attaches the middleware when origins is non-empty. In production,
TW_ALLOWED_ORIGINS is empty (same-origin via Caddy reverse-proxy), so
no CORS middleware is installed. Dev behaviour is unchanged — the
default remains http://localhost:5173, so the dev server still has the
middleware attached.

Module-level app() is preserved for uvicorn; the factory exists so the
new test in test_api.py can construct an app with origins=[] and assert
the middleware is absent.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Backend — bump version constant (housekeeping, included with main.py change)

This is folded into Task 2's commit (the version bump `0.1.0` → `0.2.0` in the factory). No additional steps needed.

---

## Task 4: Add the Caddyfile

**Files:**
- Create: `deploy/Caddyfile`

- [ ] **Step 1: Create the Caddyfile with the locked-in subdomain**

Create `deploy/Caddyfile` with this content:

```caddyfile
# Tender Watch — single-host Caddy config.
# Serves the static SPA at / and reverse-proxies /api/* to the FastAPI
# backend (uvicorn) running on loopback. TLS is auto-issued by Caddy
# via Let's Encrypt (ACME HTTP-01 on :80).

tender-watch.galactix.co.za {
    root * /var/www/tender-watch
    encode gzip zstd

    # SPA rewrite: any unknown path serves index.html so client-side
    # routing works after page reloads.
    try_files {path} /index.html
    file_server

    # Backend traffic — proxied to the local uvicorn process.
    @api path /api/*
    reverse_proxy @api 127.0.0.1:8000 {
        # Forward the original Host header (uvicorn doesn't use it for
        # routing, but logs are clearer with the real hostname).
        header_up Host {host}
    }

    log {
        output file /var/log/caddy/tender-watch.log {
            roll_size 10mb
            roll_keep 5
        }
    }
}
```

- [ ] **Step 2: Commit the Caddyfile**

```bash
git add deploy/Caddyfile
git commit -m "feat(deploy): add Caddyfile for tender-watch.galactix.co.za

Caddy v2 site config: serves the static Vite dist/ at /, reverse-proxies
/api/* to uvicorn on 127.0.0.1:8000. TLS is auto-issued and renewed via
Let's Encrypt (ACME HTTP-01). The SPA rewrite (try_files {path}
/index.html) preserves client-side routing across page reloads.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Add the systemd unit

**Files:**
- Create: `deploy/tender-watch-backend.service`

- [ ] **Step 1: Create the systemd unit**

Create `deploy/tender-watch-backend.service` with this content:

```ini
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

- [ ] **Step 2: Verify the file is syntactically valid by smoke-loading it**

Run (on any host with `systemd-analyze` available — skip if not present locally; the install script validates on the target box):

```bash
systemd-analyze verify deploy/tender-watch-backend.service
```

Expected (if systemd-analyze is present): exit 0. If `systemd-analyze` is not on this dev machine, skip this step — the install script will validate on the target host.

- [ ] **Step 3: Commit the unit**

```bash
git add deploy/tender-watch-backend.service
git commit -m "feat(deploy): add systemd unit for the FastAPI backend

Binds uvicorn to 127.0.0.1:8000 (loopback only — never reachable from
off-host), restarts on failure after 3s, and confines the process to
reading the FS read-only except for /etc/tender-watch where the
config JSON lives. Logs go to the systemd journal.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Add `install.sh`

**Files:**
- Create: `deploy/install.sh`

- [ ] **Step 1: Create the install script**

Create `deploy/install.sh` with this content:

```bash
#!/usr/bin/env bash
# Tender Watch — one-time host setup.
#
# Idempotent: skips steps that are already done (re-running this script
# is safe; it will not blow away an existing install).
#
# Usage: sudo bash deploy/install.sh
#
# What it does:
#   1. Pre-flight: verify the A record for tender-watch.galactix.co.za
#      resolves to this host's public IP. Aborts if not.
#   2. Install OS packages (Caddy + Python 3.12 + rsync + node).
#   3. Create the tender-watch system user.
#   4. Create the app, config, and log directories.
#   5. Set up the Python venv and install backend deps.
#   6. Seed /etc/tender-watch/config.json with Config() defaults.
#   7. Write /etc/tender-watch/backend.env.
#   8. Build the SPA and copy dist/ to /var/www/tender-watch/.
#   9. Write /etc/caddy/Caddyfile and validate it.
#  10. Write the systemd unit and enable both services.
#  11. Wait for Caddy's ACME cert to issue.
#  12. Smoke-test /api/health.

set -euo pipefail

DOMAIN="tender-watch.galactix.co.za"
PUBLIC_IP="$(curl -fsS https://api.ipify.org || true)"
if [[ -z "${PUBLIC_IP:-}" ]]; then
    echo "FATAL: could not determine this host's public IP." >&2
    exit 1
fi

echo "=== Tender Watch install ==="
echo "Domain:    $DOMAIN"
echo "Public IP: $PUBLIC_IP"
echo ""

# --- 1. Pre-flight -----------------------------------------------------------
echo "[1/12] Verifying DNS A record for $DOMAIN ..."
RESOLVED_IP="$(getent hosts "$DOMAIN" | awk '{print $1; exit}')" || true
if [[ -z "${RESOLVED_IP:-}" ]]; then
    echo "FATAL: $DOMAIN does not resolve. Add an A record pointing at $PUBLIC_IP first." >&2
    exit 1
fi
if [[ "$RESOLVED_IP" != "$PUBLIC_IP" ]]; then
    echo "FATAL: $DOMAIN resolves to $RESOLVED_IP, but this host is $PUBLIC_IP." >&2
    echo "Fix the A record (or wait for DNS to propagate) and re-run." >&2
    exit 1
fi
echo "  OK: $DOMAIN -> $RESOLVED_IP"

# --- 2. Packages -------------------------------------------------------------
echo "[2/12] Installing OS packages ..."
if command -v apt-get >/dev/null 2>&1; then
    PKG_MGR=apt
elif command -v dnf >/dev/null 2>&1; then
    PKG_MGR=dnf
else
    echo "FATAL: neither apt-get nor dnf is available. Install Caddy + Python 3.12 manually." >&2
    exit 1
fi

case "$PKG_MGR" in
    apt)
        # Caddy is not in Debian's default repos — add the official repo.
        if ! command -v caddy >/dev/null 2>&1; then
            apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
            curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
                | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
            curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
                | tee /etc/apt/sources.list.d/caddy-stable.list
            apt-get update
        fi
        apt-get install -y caddy python3.12 python3.12-venv python3-pip rsync nodejs npm
        ;;
    dnf)
        echo "INFO: dnf detected. Caddy is not in RHEL/Fedora defaults — install manually first." >&2
        dnf install -y python3.12 python3.12-pip rsync nodejs npm
        ;;
esac

# --- 3. System user ----------------------------------------------------------
echo "[3/12] Creating system user ..."
if ! id tender-watch >/dev/null 2>&1; then
    useradd --system --shell /usr/sbin/nologin --home-dir /opt/tender-watch tender-watch
fi

# --- 4. Directories ----------------------------------------------------------
echo "[4/12] Creating directories ..."
mkdir -p /opt/tender-watch /etc/tender-watch /var/www/tender-watch /var/log/caddy
chown -R tender-watch:tender-watch /opt/tender-watch /etc/tender-watch
# /var/www/tender-watch must be readable by the Caddy user (www-data on Debian).
chown -R www-data:www-data /var/www/tender-watch || true

# --- 5. Backend venv + deps --------------------------------------------------
echo "[5/12] Setting up backend venv ..."
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ ! -d /opt/tender-watch/backend/.venv ]]; then
    cp -r "$REPO_ROOT/backend" /opt/tender-watch/
    chown -R tender-watch:tender-watch /opt/tender-watch/backend
    sudo -u tender-watch python3.12 -m venv /opt/tender-watch/backend/.venv
    sudo -u tender-watch /opt/tender-watch/backend/.venv/bin/pip install --upgrade pip
    sudo -u tender-watch /opt/tender-watch/backend/.venv/bin/pip install -e "/opt/tender-watch/backend[prod]"
fi

# --- 6. Seed config.json -----------------------------------------------------
echo "[6/12] Seeding config.json ..."
if [[ ! -f /etc/tender-watch/config.json ]]; then
    sudo -u tender-watch /opt/tender-watch/backend/.venv/bin/python -c \
        "from app.models import Config; print(Config().model_dump_json(indent=2))" \
        > /etc/tender-watch/config.json
    chown root:tender-watch /etc/tender-watch/config.json
    chmod 0640 /etc/tender-watch/config.json
fi

# --- 7. Write backend.env ----------------------------------------------------
echo "[7/12] Writing backend.env ..."
if [[ ! -f /etc/tender-watch/backend.env ]]; then
    cat > /etc/tender-watch/backend.env <<'EOF'
TW_API_BASE=https://ocds-api.etenders.gov.za
TW_CONFIG_PATH=/etc/tender-watch/config.json
TW_CACHE_TTL_SECONDS=60
TW_ALLOWED_ORIGINS=
TW_LOG_LEVEL=INFO
EOF
    chown root:tender-watch /etc/tender-watch/backend.env
    chmod 0640 /etc/tender-watch/backend.env
fi

# --- 8. Build SPA ------------------------------------------------------------
echo "[8/12] Building SPA ..."
if [[ ! -d /opt/tender-watch/frontend ]]; then
    cp -r "$REPO_ROOT/frontend" /opt/tender-watch/
    chown -R tender-watch:tender-watch /opt/tender-watch/frontend
fi
sudo -u tender-watch bash -c '
    cd /opt/tender-watch/frontend
    npm ci
    npm run build
'
rm -rf /var/www/tender-watch/*
cp -r /opt/tender-watch/frontend/dist/. /var/www/tender-watch/
chown -R www-data:www-data /var/www/tender-watch

# --- 9. Caddyfile ------------------------------------------------------------
echo "[9/12] Writing Caddyfile ..."
if ! grep -q "$DOMAIN" /etc/caddy/Caddyfile 2>/dev/null; then
    # Back up any existing Caddyfile.
    [[ -f /etc/caddy/Caddyfile ]] && cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%s)
    cp "$REPO_ROOT/deploy/Caddyfile" /etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile

# --- 10. systemd unit + enable ----------------------------------------------
echo "[10/12] Installing systemd unit ..."
cp "$REPO_ROOT/deploy/tender-watch-backend.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now caddy
systemctl enable --now tender-watch-backend

# --- 11. Wait for ACME -------------------------------------------------------
echo "[11/12] Waiting for Let's Encrypt cert ..."
SUCCESS=0
for _ in $(seq 1 60); do
    if caddy list-modules 2>/dev/null | grep -q "^http.handlers.reverse_proxy$"; then
        # Check that Caddy successfully obtained a cert.
        if journalctl -u caddy --since "1 min ago" --no-pager 2>/dev/null \
                | grep -qiE "certificate obtained successfully|obtained certificate"; then
            SUCCESS=1
            break
        fi
    fi
    sleep 2
done
if [[ "$SUCCESS" -ne 1 ]]; then
    echo "WARNING: Caddy did not report a successful cert issue within 120s." >&2
    echo "  Check: journalctl -u caddy -n 50" >&2
    echo "  Common cause: the A record is correct from your DNS but the box is firewalled on :80." >&2
fi

# --- 12. Smoke test ----------------------------------------------------------
echo "[12/12] Smoke test ..."
if curl -fsS --max-time 10 "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    echo "  OK: https://$DOMAIN/api/health is reachable."
else
    echo "WARNING: smoke test failed. Check 'journalctl -u caddy' and 'journalctl -u tender-watch-backend'." >&2
fi

echo ""
echo "=== Install complete ==="
echo ""
echo "Useful commands:"
echo "  View backend logs:    sudo journalctl -u tender-watch-backend -f"
echo "  View Caddy logs:      sudo journalctl -u caddy -f"
echo "  Edit config JSON:     sudo \$EDITOR /etc/tender-watch/config.json"
echo "  Restart backend:      sudo systemctl restart tender-watch-backend"
echo "  Reload Caddy config:  sudo systemctl reload caddy"
echo ""
```

- [ ] **Step 2: Make the script executable in the repo**

Run:
```bash
git update-index --chmod=+x deploy/install.sh
```

This records the executable bit in the index so it survives `git checkout`. The actual bit on the working-tree file is also set after this command.

- [ ] **Step 3: Commit the install script**

```bash
git add deploy/install.sh
git commit -m "feat(deploy): add install.sh for first-time host setup

Idempotent. Verifies the A record before doing anything, installs
Caddy + Python 3.12 + rsync + Node, creates the tender-watch system
user, sets up the venv, seeds config.json with Config() defaults,
writes backend.env, builds the SPA, writes the Caddyfile, enables
the systemd unit, and smoke-tests /api/health. Auto-detects apt vs
dnf for the package manager.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Add `deploy.sh`

**Files:**
- Create: `deploy/deploy.sh`

- [ ] **Step 1: Create the deploy script**

Create `deploy/deploy.sh` with this content:

```bash
#!/usr/bin/env bash
# Tender Watch — laptop → host deploy.
#
# Builds the SPA, rsyncs dist/ and backend/ to the host, then restarts
# the backend (Caddy picks up the new dist/ on next request — no restart
# needed).
#
# Usage:
#   bash deploy/deploy.sh [user@host]
#
# Defaults to the value of $TW_DEPLOY_HOST, falling back to
# tender-watch@<host-ip>. The host IP is read from the A record.

set -euo pipefail

DOMAIN="tender-watch.galactix.co.za"

if [[ $# -ge 1 ]]; then
    DEPLOY_TARGET="$1"
elif [[ -n "${TW_DEPLOY_HOST:-}" ]]; then
    DEPLOY_TARGET="$TW_DEPLOY_HOST"
else
    HOST_IP="$(getent hosts "$DOMAIN" | awk '{print $1; exit}')"
    if [[ -z "${HOST_IP:-}" ]]; then
        echo "FATAL: $DOMAIN does not resolve. Cannot determine the host IP." >&2
        exit 1
    fi
    DEPLOY_TARGET="tender-watch@${HOST_IP}"
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Tender Watch deploy ==="
echo "Target: $DEPLOY_TARGET"
echo ""

# --- 1. Build SPA -----------------------------------------------------------
echo "[1/3] Building SPA ..."
cd "$REPO_ROOT/frontend"
npm ci
npm run build
cd "$REPO_ROOT"

# --- 2. rsync ----------------------------------------------------------------
echo "[2/3] Syncing ..."
rsync -az --delete "$REPO_ROOT/frontend/dist/" "${DEPLOY_TARGET}:/var/www/tender-watch/"
rsync -az --delete \
    --exclude .venv --exclude __pycache__ \
    --exclude .pytest_cache --exclude .ruff_cache \
    "$REPO_ROOT/backend/" "${DEPLOY_TARGET}:/opt/tender-watch/backend/"

# --- 3. Restart backend -----------------------------------------------------
echo "[3/3] Restarting backend ..."
ssh "$DEPLOY_TARGET" 'sudo systemctl restart tender-watch-backend && sudo systemctl --no-pager status tender-watch-backend | head -n 3'

echo ""
echo "=== Deploy complete ==="
echo "URL: https://$DOMAIN"
```

- [ ] **Step 2: Make the script executable in the repo**

Run:
```bash
git update-index --chmod=+x deploy/deploy.sh
```

- [ ] **Step 3: Commit the deploy script**

```bash
git add deploy/deploy.sh
git commit -m "feat(deploy): add deploy.sh for laptop-to-host updates

Rsyncs the freshly-built dist/ and the backend/ tree to the host,
then restarts the backend (Caddy serves the new dist/ without a
restart). Default target is tender-watch@<host-ip>; override with
$TW_DEPLOY_HOST or as the first arg.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Rewrite `deploy/README.md`

**Files:**
- Modify: `deploy/README.md` (replace the entire file)

- [ ] **Step 1: Read the current deploy/README.md to confirm its size**

Run:
```bash
wc -l deploy/README.md
```

Expected: a small file (~30 lines). Note the current line count for the commit.

- [ ] **Step 2: Overwrite `deploy/README.md` with the runbook**

Overwrite the file with this content:

````markdown
# Tender Watch — Deploy

Single-host deployment at `https://tender-watch.galactix.co.za`. Caddy
terminates TLS, serves the static Vite `dist/`, and reverse-proxies
`/api/*` to uvicorn on loopback. `systemd` supervises uvicorn.

## Files in this folder

- `Caddyfile` — Caddy v2 site config. Installed to `/etc/caddy/Caddyfile`.
- `tender-watch-backend.service` — systemd unit. Installed to
  `/etc/systemd/system/tender-watch-backend.service`.
- `install.sh` — first-time host setup. Run once per host with `sudo`.
- `deploy.sh` — laptop → host updates. Run from your dev machine.
- `README.md` — this file.

## First-time setup on a new host

```bash
# 1. Point an A record at the host's public IP.
#    Lower TTL to 300s at least 24h before cutover so the DNS switch
#    propagates in ≤5 min.

# 2. From your laptop, SSH into the new host as a user with sudo:
ssh user@<host-ip>

# 3. Copy the repo (or git clone) onto the host, then:
cd <repo-root>
sudo bash deploy/install.sh
```

The install script is idempotent. It will:

1. Verify the A record points at this host's public IP. Aborts if not.
2. Install Caddy + Python 3.12 + rsync + Node.
3. Create the `tender-watch` system user.
4. Set up `/opt/tender-watch/backend/.venv` and install the backend deps.
5. Seed `/etc/tender-watch/config.json` with `Config()` defaults.
6. Write `/etc/tender-watch/backend.env` (same-origin; `TW_ALLOWED_ORIGINS=""`).
7. Build the SPA and copy `dist/` to `/var/www/tender-watch/`.
8. Write `/etc/caddy/Caddyfile` and validate it.
9. Enable and start `caddy` and `tender-watch-backend` services.
10. Wait for Let's Encrypt to issue the cert.
11. Smoke-test `https://tender-watch.galactix.co.za/api/health`.

## Updating the site

From your laptop, after a code change:

```bash
bash deploy/deploy.sh                    # uses $TW_DEPLOY_HOST or the A record
# or:
TW_DEPLOY_HOST=tender-watch@1.2.3.4 bash deploy/deploy.sh
```

The deploy script builds the SPA, rsyncs `dist/` and `backend/` to the
host, and restarts the backend. Caddy does not need a restart — it
picks up the new `dist/` files on next request.

## Daily ops

```bash
# Tail backend logs:
sudo journalctl -u tender-watch-backend -f

# Tail Caddy logs:
sudo journalctl -u caddy -f

# Edit the user-editable filter config (any text editor):
sudo $EDITOR /etc/tender-watch/config.json
# The config is read fresh on every /api/matches request — no restart needed.

# Reload Caddy after editing /etc/caddy/Caddyfile manually:
sudo systemctl reload caddy

# Restart the backend (e.g. after editing backend.env):
sudo systemctl restart tender-watch-backend
```

## Backing up

There is one piece of persistent state: `/etc/tender-watch/config.json`.
It contains the user's keywords, buyer allowlist, lookback window, and
thresholds. Back it up however the rest of your `/etc/` is backed up.

There is no database and no cache file — the in-memory TTL cache is
rebuilt on each process restart.

## Tearing down the old Vercel + Render setup

Once the new site is verified at `https://tender-watch.galactix.co.za`:

1. Log into the Render dashboard → cancel the `tender-watch-backend` service.
2. Log into the Vercel dashboard → delete the `tender-watch` project.

The next code change after that will land the file deletions (vercel.json,
render.yaml, deploy-frontend.ps1) and the README/env-var rewrites.

## Rollback

Until the old Render service is cancelled, the old site is still live.
Setting the A record back to Render's IP restores the old site within
the DNS TTL window (≤5 min).
````

- [ ] **Step 3: Commit the rewritten runbook**

```bash
git add deploy/README.md
git commit -m "docs(deploy): rewrite README as runbook for Caddy + systemd

Covers first-time setup (install.sh), updates (deploy.sh), daily ops
(journalctl, config edits), backups (one config.json), and teardown
of the old Vercel + Render setup. Replaces the previous runbook that
described the Vercel one-shot deploy script.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Delete the old deploy artefacts

**Files:**
- Delete: `deploy/render.yaml`
- Delete: `deploy/deploy-frontend.ps1`
- Delete: `frontend/vercel.json`

> **Pre-flight:** Confirm with the operator that the old Render service
> and Vercel project have been cancelled/deleted before this task. The
> code cleanup is safe to land even if they haven't, but it's tidy to
> match the code to the new world. If they haven't been torn down yet,
> skip this task and return to it after tear-down.

- [ ] **Step 1: Delete the three files**

Run:
```bash
git rm deploy/render.yaml
git rm deploy/deploy-frontend.ps1
git rm frontend/vercel.json
```

Expected output: each command prints `rm '...'` with the file path.

- [ ] **Step 2: Verify the working tree is clean except for these deletions**

Run:
```bash
git status
```

Expected: only the three deletions are listed. Nothing else untracked.

- [ ] **Step 3: Verify the frontend still builds**

Run:
```bash
cd frontend
npm run build
cd ..
```

Expected: build completes successfully. The deletion of `vercel.json`
should not affect the Vite build at all — Vite has its own config in
`vite.config.ts`.

- [ ] **Step 4: Run the full frontend test suite**

Run:
```bash
cd frontend
npx vitest run
cd ..
```

Expected: all 21 tests pass. No test depended on `vercel.json`.

- [ ] **Step 5: Commit the deletions**

```bash
git commit -m "chore(deploy): drop Vercel and Render artefacts

Remove vercel.json (the SPA rewrites are now expressed in the Caddy
Caddyfile's try_files rule), render.yaml (the backend is now hosted
on a single box, not as a Render Blueprint), and the Vercel one-shot
deploy-frontend.ps1 script (replaced by deploy.sh for laptop-to-host
rsync). The deploy/ folder now contains only Caddy + systemd artefacts
and the install/deploy scripts.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Rewrite the README's Deploy and Security & hardening sections

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current README to find the Deploy section**

Run:
```bash
grep -n "^## " README.md
```

Note the line numbers of the `## Deploy` and `## Security & hardening` sections.

- [ ] **Step 2: Replace the Deploy section**

In `README.md`, find the block that starts with `## Deploy` and ends right before `## Security & hardening`. Replace it with:

````markdown
## Deploy

Single-host deployment at `https://tender-watch.galactix.co.za`. Caddy
terminates TLS, serves the Vite `dist/`, and reverse-proxies `/api/*` to
uvicorn on loopback. `systemd` supervises uvicorn.

- `deploy/Caddyfile` — Caddy v2 site config (installed by `install.sh`).
- `deploy/tender-watch-backend.service` — systemd unit for uvicorn.
- `deploy/install.sh` — first-time host setup. Idempotent.
- `deploy/deploy.sh` — laptop → host updates.

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

## Configuration
````

The new "Configuration" header continues into the unchanged env-var
table that already exists in the current README — just removing the
old Deploy block. The line `## Configuration` must not be duplicated.

- [ ] **Step 3: Replace the Security & hardening section**

In `README.md`, find the block that starts with `## Security & hardening`
and ends right before `## License`. Replace it with:

````markdown
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
````

- [ ] **Step 4: Verify the README still renders sensibly**

Run:
```bash
grep -n "^## " README.md
```

Expected: the section list now reads (in order):

```
## Architecture
## Quick start
## Tests
## Deploy        <-- updated
## Configuration
## Security & hardening   <-- updated
## License
```

- [ ] **Step 5: Commit the README changes**

```bash
git add README.md
git commit -m "docs: rewrite README Deploy + Security sections for self-hosted

Replaces the Vercel + Render deploy instructions with the Caddy +
systemd flow (install.sh on the host, deploy.sh from the laptop).
Updates the Security section to reflect loopback binding, systemd
ProtectSystem, and Caddy's auto-TLS. The Architecture, Quick start,
Tests, Configuration, and License sections are unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Update `.env.example`

**Files:**
- Modify: `backend/.env.example`

- [ ] **Step 1: Replace `backend/.env.example` with the new template**

Overwrite the file with:

```
# eTenders OCDS Public API base
TW_API_BASE=https://ocds-api.etenders.gov.za

# Where the user-editable config JSON lives.
# Dev: ./config/tender-watch.json (relative to backend/).
# Production (Caddy + systemd): /etc/tender-watch/config.json.
TW_CONFIG_PATH=./config/tender-watch.json

# In-memory response cache TTL
TW_CACHE_TTL_SECONDS=60

# Comma-separated CORS origins.
# Dev (Vite at :5173, backend at :8000): http://localhost:5173
# Production (same-origin via Caddy reverse-proxy): leave empty.
TW_ALLOWED_ORIGINS=http://localhost:5173

# Log level
TW_LOG_LEVEL=INFO
```

- [ ] **Step 2: Verify the change is a clean replacement**

Run:
```bash
cat backend/.env.example
```

Expected: matches the content above exactly. No trailing whitespace on
any line, file ends with a newline.

- [ ] **Step 3: Commit the env-var template update**

```bash
git add backend/.env.example
git commit -m "docs(backend): update .env.example for same-origin prod

Adds comments explaining the dev-vs-prod split for TW_CONFIG_PATH
and TW_ALLOWED_ORIGINS. Production leaves TW_ALLOWED_ORIGINS empty
because Caddy reverse-proxies /api/* on the same origin — the
CORSMiddleware is intentionally not attached when the env var is
empty.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Update `docs/open-items.md`

**Files:**
- Modify: `docs/open-items.md`

- [ ] **Step 1: Find the existing "Resolved during build" block**

Run:
```bash
grep -n "^## " docs/open-items.md
```

Note the line number of `## Resolved during build`.

- [ ] **Step 2: Add a new "Resolved by v0.2.0" block immediately after the existing "Resolved during build" block**

Insert this content right before the `## Deferred to v0.2.0` heading (so
the new block sits between "Resolved during build" and "Deferred"):

```markdown
## Resolved by v0.2.0

- **Hosting choice** (from v0.1.0; revisited in `docs/superpowers/specs/2026-06-24-drop-vercel-render-design.md`)
  - **Decision:** Single self-hosted origin at `tender-watch.galactix.co.za`.
    Caddy terminates TLS (auto-issued via Let's Encrypt), serves the static
    Vite `dist/` at `/`, and reverse-proxies `/api/*` to uvicorn on
    `127.0.0.1:8000`. `systemd` supervises uvicorn.
  - **Where it lives:** `deploy/Caddyfile`; `deploy/tender-watch-backend.service`;
    `deploy/install.sh`; `deploy/deploy.sh`; spec
    `docs/superpowers/specs/2026-06-24-drop-vercel-render-design.md`.

- **CORS** (from `docs/superpowers/specs/2026-06-24-drop-vercel-render-design.md` §4.1)
  - **Decision:** Production `TW_ALLOWED_ORIGINS=""`. `create_app(origins=[])`
    in `backend/app/main.py` skips attaching `CORSMiddleware` entirely. The
    SPA makes same-origin requests because Caddy reverse-proxies `/api/*`.
  - **Where it lives:** `backend/app/main.py` (`create_app` factory);
    `backend/tests/test_api.py::test_cors_middleware_not_attached_when_origins_empty`.

- **TLS** (from `docs/superpowers/specs/2026-06-24-drop-vercel-render-design.md` §12)
  - **Decision:** Caddy auto-issues and renews a Let's Encrypt certificate
    via ACME HTTP-01 on port 80. No cert management by the operator.
  - **Where it lives:** `deploy/Caddyfile` (the `tender-watch.galactix.co.za`
    block — TLS is implicit in Caddy when an email is configured globally).

```

- [ ] **Step 3: Verify the section ordering reads sensibly**

Run:
```bash
grep -n "^## " docs/open-items.md
```

Expected: sections now read (in order):

```
## Resolved during build
## Resolved by v0.2.0      <-- new
## Deferred to v0.2.0
## Out of scope by design
```

- [ ] **Step 4: Commit the open-items update**

```bash
git add docs/open-items.md
git commit -m "docs: record v0.2.0 resolutions for hosting, CORS, TLS

Adds a new 'Resolved by v0.2.0' block to docs/open-items.md covering
the three decisions made in the drop-vercel-render spec: single-host
Caddy + systemd, same-origin CORS via create_app factory, and
auto-TLS via Caddy. Each resolution cites the file:line locations of
the artefacts that implement it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: End-to-end manual smoke test (operator-driven)

This task is not code — it's the validation step that closes the loop.

**Files:** none.

- [ ] **Step 1: Verify all commits landed and the tree is clean**

Run:
```bash
git log --oneline -15
git status
```

Expected: 12 new commits since the spec commits (Tasks 1–12 each land
one commit). Working tree clean.

- [ ] **Step 2: Verify the full test suites still pass**

Run:
```bash
# Backend
cd backend
.venv\Scripts\python -m pytest -v
.venv\Scripts\python -m ruff check .
cd ..

# Frontend
cd frontend
npx vitest run
npm run lint
npx tsc --noEmit
cd ..
```

Expected: backend 25/25 pass, ruff clean. Frontend 21/21 pass, ESLint
clean, TypeScript clean.

- [ ] **Step 3: Verify the SPA still builds**

Run:
```bash
cd frontend
npm run build
cd ..
ls frontend/dist/index.html
```

Expected: build succeeds, `dist/index.html` exists.

- [ ] **Step 4: Report status to the operator**

Print (or paste into chat) a one-line summary of:

- Number of commits since the spec.
- Test counts (backend / frontend).
- The hostname to use for the production deploy: `tender-watch.galactix.co.za`.
- The single command the operator runs on a fresh host:
  `sudo bash deploy/install.sh`.
- The single command the operator runs on their laptop to ship updates:
  `bash deploy/deploy.sh`.

The plan is complete at this point. The implementation has produced:

- 1 refactored backend file (`backend/app/main.py`)
- 1 modified test file (`backend/tests/test_api.py`, +1 test)
- 5 new files in `deploy/` (Caddyfile, systemd unit, install.sh, deploy.sh, rewritten README)
- 3 deleted files (`vercel.json`, `render.yaml`, `deploy-frontend.ps1`)
- 4 modified doc/config files (`README.md`, `backend/.env.example`, `docs/open-items.md`)
- 12 commits total in this implementation, each independently revertable.

No further tasks. The next phase is operational: the operator picks a
host, adds the A record, runs `install.sh`, smoke-tests, then cancels
the old Render service and Vercel project per the cutover plan in
`deploy/README.md`.
