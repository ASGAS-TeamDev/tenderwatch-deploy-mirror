#!/usr/bin/env bash
# Tender Watch — one-time host setup on 156.38.222.220 (shared xneelo nginx box).
#
# Target domain: watch.titan-ai.co.za
# Front-end:    nginx (already serving app/api/n8n.titan-ai.co.za on this box)
# Back-end:     uvicorn on 127.0.0.1:8001, supervised by systemd
# TLS:          Let's Encrypt via `certbot --nginx` (certbot already installed
#               — used for api.titan-ai.co.za)
#
# Idempotent: re-running is safe and will not blow away an existing install.
# For shipping code changes to an existing install, use deploy.sh instead.
#
# Usage: sudo bash deploy/install.sh
#
# What it does:
#   1.  Pre-flight: confirm we are root, DNS resolves to this box, port 8001 free.
#   2.  Install OS packages (Python 3.12 + rsync + node + certbot-nginx if missing).
#   3.  Create the tender-watch system user.
#   4.  Create app / config / docroot / log directories.
#   5.  Set up the Python venv and install backend deps.
#   6.  Seed /etc/tender-watch/config.json with Config() defaults.
#   7.  Write /etc/tender-watch/backend.env (same-origin; TW_ALLOWED_ORIGINS="").
#   8.  Build the SPA and copy dist/ to the docroot.
#   9.  Install the nginx vhost and enable the site (symlink + nginx -t + reload).
#  10.  Install the systemd unit and enable + start tender-watch-backend.
#  11.  Issue the TLS cert via certbot --nginx -d watch.titan-ai.co.za --redirect.
#  12.  Smoke-test https://watch.titan-ai.co.za/api/health.

set -euo pipefail

DOMAIN="watch.titan-ai.co.za"
BACKEND_PORT="8001"
DOCROOT="/var/www/watch.titan-ai.co.za"
NGINX_VHOST_SRC="$(cd "$(dirname "$0")" && pwd)/nginx/watch.titan-ai.co.za.conf"
NGINX_VHOST_DST="/etc/nginx/sites-available/watch.titan-ai.co.za.conf"
NGINX_VHOST_LINK="/etc/nginx/sites-enabled/watch.titan-ai.co.za.conf"

echo "=== Tender Watch install (nginx host) ==="
echo "Domain:      $DOMAIN"
echo "Backend port: 127.0.0.1:$BACKEND_PORT"
echo "Docroot:     $DOCROOT"
echo ""

# --- 1. Pre-flight ----------------------------------------------------------
echo "[1/12] Pre-flight ..."
if [[ "$(id -u)" -ne 0 ]]; then
    echo "FATAL: run with sudo. Usage: sudo bash deploy/install.sh" >&2
    exit 1
fi

PUBLIC_IP="$(curl -fsS --max-time 10 https://api.ipify.org || true)"
if [[ -z "${PUBLIC_IP:-}" ]]; then
    echo "FATAL: could not determine this host's public IP." >&2
    exit 1
fi

RESOLVED_IP="$(getent hosts "$DOMAIN" | awk '{print $1; exit}')" || true
if [[ -z "${RESOLVED_IP:-}" ]]; then
    echo "FATAL: $DOMAIN does not resolve. Add an A record -> $PUBLIC_IP and re-run." >&2
    exit 1
fi
if [[ "$RESOLVED_IP" != "$PUBLIC_IP" ]]; then
    echo "FATAL: $DOMAIN resolves to $RESOLVED_IP, but this host is $PUBLIC_IP." >&2
    echo "Fix the A record to $PUBLIC_IP (and wait for DNS propagation) and re-run." >&2
    exit 1
fi
echo "  OK: $DOMAIN -> $RESOLVED_IP"

# Confirm nginx is the front-end (not apache or caddy).
if ! systemctl is-active --quiet nginx; then
    echo "WARNING: nginx is not active. This script assumes the xneelo nginx setup." >&2
    echo "         If the box uses a different front-end, abort and re-plan." >&2
    read -rp "Continue anyway? [y/N] " yn
    [[ "$yn" =~ ^[Yy]$ ]] || exit 1
fi

# Port preflight: 8001 must be free.
if ss -ltnp 2>/dev/null | grep -q ":$BACKEND_PORT "; then
    echo "FATAL: 127.0.0.1:$BACKEND_PORT is already in use. Pick another port" >&2
    echo "       and update deploy/tender-watch-backend.service + the nginx vhost." >&2
    exit 1
fi
echo "  OK: 127.0.0.1:$BACKEND_PORT is free"

# --- 2. Packages ------------------------------------------------------------
echo "[2/12] Installing OS packages ..."
apt-get update -qq

# Python 3.12 — stock on Ubuntu 24.04, needs deadsnakes PPA on 22.04 (jammy).
if ! command -v python3.12 >/dev/null 2>&1; then
    if ! apt-get install -yqq python3.12 python3.12-venv >/dev/null 2>&1; then
        echo "  python3.12 not in stock repos — adding deadsnakes PPA ..."
        apt-get install -yqq software-properties-common gnupg
        add-apt-repository -y ppa:deadsnakes/ppa
        apt-get update -qq
        apt-get install -yqq python3.12 python3.12-venv
    fi
fi

# Install each remaining package individually with a presence guard.
# Never bulk-install — a single held package (e.g. an existing pip/snap
# certbot conflicting with the apt certbot) would abort the whole step.
# Only install what's actually missing on this box.
for pkg in rsync nodejs npm; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1 \
            && ! command -v "$pkg" >/dev/null 2>&1; then
        apt-get install -yqq "$pkg"
    fi
done

# certbot: do NOT install via apt if a newer certbot is already present
# (this box has certbot 5.7.0, likely from pip/snap — far newer than
# jammy's apt package). Re-installing via apt would trigger held-package
# conflicts. Only ensure the nginx plugin is available for whichever
# certbot is installed.
if ! command -v certbot >/dev/null 2>&1; then
    apt-get install -yqq certbot python3-certbot-nginx
else
    # certbot exists — ensure its nginx plugin is installed.
    # For snap certbot, the plugin ships in the snap; for pip certbot,
    # install via pip into certbot's venv. For apt certbot, use apt.
    if certbot plugins 2>/dev/null | grep -qi nginx; then
        : # nginx plugin already available
    elif dpkg -s python3-certbot-nginx >/dev/null 2>&1; then
        : # apt plugin package installed
    else
        # Try apt first; if it conflicts (held packages), fall back to pip
        # into the same Python that runs certbot.
        if ! apt-get install -yqq python3-certbot-nginx >/dev/null 2>&1; then
            CERTBOT_PY="$(readlink -f "$(command -v certbot)")"
            CERTBOT_PY_DIR="$(dirname "${CERTBOT_PY}")"
            echo "  apt python3-certbot-nginx unavailable — trying pip in $CERTBOT_PY_DIR ..."
            # If certbot is a pip install in a venv, this puts the plugin next to it.
            "${CERTBOT_PY_DIR}/pip" install certbot-nginx 2>/dev/null \
                || pip3 install --user certbot-nginx 2>/dev/null \
                || echo "  WARNING: could not install certbot-nginx plugin via apt or pip. certbot --nginx may fail at step 11." >&2
        fi
    fi
fi

# --- 3. System user --------------------------------------------------------
echo "[3/12] Creating system user ..."
if ! id tender-watch >/dev/null 2>&1; then
    useradd --system --shell /usr/sbin/nologin --home-dir /opt/tender-watch tender-watch
fi

# --- 4. Directories --------------------------------------------------------
echo "[4/12] Creating directories ..."
mkdir -p /opt/tender-watch /etc/tender-watch "$DOCROOT" /var/log/nginx
chown -R tender-watch:tender-watch /opt/tender-watch /etc/tender-watch

# --- 5. Backend venv + deps ------------------------------------------------
echo "[5/12] Setting up backend venv ..."
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Always sync the backend source (preserve the .venv if it exists).
rsync -az --delete \
    --exclude .venv --exclude __pycache__ --exclude .pytest_cache --exclude .ruff_cache \
    "$REPO_ROOT/backend/" /opt/tender-watch/backend/
chown -R tender-watch:tender-watch /opt/tender-watch/backend
if [[ ! -d /opt/tender-watch/backend/.venv ]]; then
    sudo -u tender-watch python3.12 -m venv /opt/tender-watch/backend/.venv
fi
# Always (re)install deps so new requirements (e.g. asyncpg) land on
# existing installs. Idempotent when nothing changed.
sudo -u tender-watch /opt/tender-watch/backend/.venv/bin/pip install --upgrade pip
sudo -u tender-watch /opt/tender-watch/backend/.venv/bin/pip install -e "/opt/tender-watch/backend[prod]"

# --- 6. Seed config.json --------------------------------------------------
echo "[6/12] Seeding config.json ..."
if [[ ! -f /etc/tender-watch/config.json ]]; then
    sudo -u tender-watch /opt/tender-watch/backend/.venv/bin/python -c \
        "from app.models import Config; print(Config().model_dump_json(indent=2))" \
        > /etc/tender-watch/config.json
    chown root:tender-watch /etc/tender-watch/config.json
    chmod 0640 /etc/tender-watch/config.json
fi

# --- 7. Write backend.env --------------------------------------------------
echo "[7/12] Writing backend.env ..."
if [[ ! -f /etc/tender-watch/backend.env ]]; then
    cat > /etc/tender-watch/backend.env <<EOF
TW_API_BASE=https://ocds-api.etenders.gov.za
TW_CONFIG_PATH=/etc/tender-watch/config.json
TW_CACHE_TTL_SECONDS=60
TW_ALLOWED_ORIGINS=
TW_LOG_LEVEL=INFO
EOF
    chown root:tender-watch /etc/tender-watch/backend.env
    chmod 0640 /etc/tender-watch/backend.env
fi
# Ensure newer keys exist on existing installs without touching values
# already set by hand.
ensure_env_key() {
    local key="$1" comment="$2"
    if ! grep -q "^${key}=" /etc/tender-watch/backend.env; then
        echo "$comment" >> /etc/tender-watch/backend.env
        echo "${key}=" >> /etc/tender-watch/backend.env
        chown root:tender-watch /etc/tender-watch/backend.env
        chmod 0640 /etc/tender-watch/backend.env
    fi
}
ensure_env_key TW_DATABASE_URL "# Postgres for the nightly n8n-synced tender data (empty = live eTenders fetch)"
ensure_env_key TW_ANTHROPIC_API_KEY "# Anthropic API key for headings/executive summaries (empty = disabled)"

# --- 8. Build SPA ----------------------------------------------------------
echo "[8/12] Building SPA ..."
# Always sync the frontend source (preserve node_modules + dist if they exist).
rsync -az --delete \
    --exclude node_modules --exclude dist \
    "$REPO_ROOT/frontend/" /opt/tender-watch/frontend/
chown -R tender-watch:tender-watch /opt/tender-watch/frontend
sudo -u tender-watch bash -c '
    cd /opt/tender-watch/frontend
    npm ci
    npm run build
'
rm -rf "$DOCROOT"/*
cp -r /opt/tender-watch/frontend/dist/. "$DOCROOT/"
# Determine nginx worker user (www-data on Debian/Ubuntu, nginx on RHEL).
NGINX_USER="$(ps -o user= -C nginx | head -1 || echo www-data)"
chown -R "$NGINX_USER":"$NGINX_USER" "$DOCROOT"

# --- 9. nginx vhost -----------------------------------------------------
echo "[9/12] Installing nginx vhost ..."
# Debian/Ubuntu layout: sites-available + symlink in sites-enabled.
# Fall back to conf.d/ if the sites-available layout is absent.
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d
cp "$NGINX_VHOST_SRC" "$NGINX_VHOST_DST"
ln -sf "$NGINX_VHOST_DST" "$NGINX_VHOST_LINK"
nginx -t
systemctl reload nginx

# --- 10. systemd unit + enable --------------------------------------------
echo "[10/12] Installing systemd unit ..."
cp "$REPO_ROOT/deploy/tender-watch-backend.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tender-watch-backend

# --- 11. TLS via certbot ---------------------------------------------------
echo "[11/12] Issuing TLS cert (certbot --nginx) ..."
# Idempotent: certbot skips if a valid cert already exists for the domain.
certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email \
    -d "$DOMAIN" --redirect || {
    echo "WARNING: certbot did not complete. Check 'certbot certificates' and" >&2
    echo "         'journalctl -u certbot'. Common cause: :80 blocked or DNS not propagated." >&2
    echo "         Re-run this script (or just: sudo certbot --nginx -d $DOMAIN --redirect)." >&2
}

# --- 12. Smoke test --------------------------------------------------------
echo "[12/12] Smoke test ..."
sleep 2
if curl -fsS --max-time 15 "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    echo "  OK: https://$DOMAIN/api/health is reachable."
else
    echo "WARNING: smoke test failed. Diagnose with:" >&2
    echo "  sudo journalctl -u tender-watch-backend -n 50" >&2
    echo "  sudo journalctl -u nginx -n 50" >&2
    echo "  sudo nginx -t" >&2
    echo "  curl -v http://127.0.0.1:$BACKEND_PORT/api/health   # backend direct" >&2
fi

echo ""
echo "=== Install complete ==="
echo ""
echo "URL: https://$DOMAIN"
echo ""
echo "Useful commands:"
echo "  Backend logs:        sudo journalctl -u tender-watch-backend -f"
echo "  nginx logs:          sudo tail -f /var/log/nginx/watch_titan-ai_*.log"
echo "  Edit config JSON:    sudo \$EDITOR /etc/tender-watch/config.json"
echo "  Restart backend:     sudo systemctl restart tender-watch-backend"
echo "  Reload nginx:        sudo systemctl reload nginx"
echo "  Renew certs:         sudo certbot renew --nginx"
echo ""
echo "Update the site from your laptop:"
echo "  bash deploy/deploy.sh   # see deploy.sh for SSH-user details"
echo ""
