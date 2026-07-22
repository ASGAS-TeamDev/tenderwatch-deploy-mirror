#!/usr/bin/env bash
# Tender Watch — one-time host setup on 156.38.222.220 (shared xneelo Apache box).
#
# Target domain: watch.titan-ai.co.za
# Front-end:    Apache (already serving app/api/n8n.titan-ai.co.za on this box)
# Back-end:     uvicorn on 127.0.0.1:8001, supervised by systemd
# TLS:          Let's Encrypt via `certbot --apache` (certbot already installed
#               — used for api.titan-ai.co.za)
#
# Idempotent: re-running is safe and will not blow away an existing install.
# For shipping code changes to an existing install, use deploy.sh instead.
#
# Usage: sudo bash deploy/install.sh
#
# What it does:
#   1.  Pre-flight: confirm we are root, DNS resolves, port 8001 is free.
#   2.  Install OS packages (Python 3.12 + rsync + node + certbot if missing).
#   3.  Enable Apache modules: proxy, proxy_http, rewrite, headers, ssl.
#   4.  Create the tender-watch system user.
#   5.  Create app / config / docroot / log directories.
#   6.  Set up the Python venv and install backend deps.
#   7.  Seed /etc/tender-watch/config.json with Config() defaults.
#   8.  Write /etc/tender-watch/backend.env (same-origin; TW_ALLOWED_ORIGINS="").
#   9.  Build the SPA and copy dist/ to the docroot.
#  10.  Install the Apache vhost, enable the site.
#  11.  Install the systemd unit and enable both services (backend first).
#  12.  Issue the TLS cert via certbot --apache.
#  13.  Smoke-test https://watch.titan-ai.co.za/api/health.

set -euo pipefail

DOMAIN="watch.titan-ai.co.za"
BACKEND_PORT="8001"
DOCROOT="/var/www/watch.titan-ai.co.za"
APACHE_VHOST_SRC="$(cd "$(dirname "$0")" && pwd)/apache/watch.titan-ai.co.za.conf"
APACHE_VHOST_DST="/etc/apache2/sites-available/watch.titan-ai.co.za.conf"

echo "=== Tender Watch install (Apache host) ==="
echo "Domain:      $DOMAIN"
echo "Backend port: 127.0.0.1:$BACKEND_PORT"
echo "Docroot:     $DOCROOT"
echo ""

# --- 1. Pre-flight ----------------------------------------------------------
echo "[1/13] Pre-flight ..."
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
    echo "Wait for DNS propagation and re-run." >&2
    exit 1
fi
echo "  OK: $DOMAIN -> $RESOLVED_IP"

# Confirm Apache is the front-end (not nginx or caddy).
if ! systemctl is-active --quiet apache2; then
    echo "WARNING: apache2 is not active. This script assumes the xneelo Apache setup." >&2
    echo "         If the box uses a different front-end, abort and re-plan." >&2
    read -rp "Continue anyway? [y/N] " yn
    [[ "$yn" =~ ^[Yy]$ ]] || exit 1
fi

# Port preflight: 8001 must be free.
if ss -ltnp 2>/dev/null | grep -q ":$BACKEND_PORT "; then
    echo "FATAL: 127.0.0.1:$BACKEND_PORT is already in use. Pick another port" >&2
    echo "       and update deploy/tender-watch-backend.service + the Apache vhost." >&2
    exit 1
fi
echo "  OK: 127.0.0.1:$BACKEND_PORT is free"

# --- 2. Packages ------------------------------------------------------------
echo "[2/13] Installing OS packages ..."
apt-get update -qq
# Python 3.12 may need the deadsnakes PPA on older Ubuntu. Try stock first.
if ! apt-get install -yqq python3.12 python3.12-venv rsync nodejs npm certbot python3-certbot-apache >/dev/null 2>&1; then
    echo "  python3.12 not in stock repos — adding deadsnakes PPA ..."
    apt-get install -yqq software-properties-common gnupg
    add-apt-repository -y ppa:deadsnakes/ppa
    apt-get update -qq
    apt-get install -yqq python3.12 python3.12-venv rsync nodejs npm certbot python3-certbot-apache
fi

# --- 3. Apache modules -----------------------------------------------------
echo "[3/13] Enabling Apache modules ..."
a2enmod proxy proxy_http rewrite headers ssl >/dev/null

# --- 4. System user --------------------------------------------------------
echo "[4/13] Creating system user ..."
if ! id tender-watch >/dev/null 2>&1; then
    useradd --system --shell /usr/sbin/nologin --home-dir /opt/tender-watch tender-watch
fi

# --- 5. Directories --------------------------------------------------------
echo "[5/13] Creating directories ..."
mkdir -p /opt/tender-watch /etc/tender-watch "$DOCROOT" /var/log/apache2
chown -R tender-watch:tender-watch /opt/tender-watch /etc/tender-watch

# --- 6. Backend venv + deps ------------------------------------------------
echo "[6/13] Setting up backend venv ..."
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ ! -d /opt/tender-watch/backend/.venv ]]; then
    cp -r "$REPO_ROOT/backend" /opt/tender-watch/
    chown -R tender-watch:tender-watch /opt/tender-watch/backend
    sudo --shell /bin/sh -u tender-watch python3.12 -m venv /opt/tender-watch/backend/.venv
    sudo --shell /bin/sh -u tender-watch /opt/tender-watch/backend/.venv/bin/pip install --upgrade pip
    sudo --shell /bin/sh -u tender-watch /opt/tender-watch/backend/.venv/bin/pip install -e "/opt/tender-watch/backend[prod]"
fi

# --- 7. Seed config.json --------------------------------------------------
echo "[7/13] Seeding config.json ..."
if [[ ! -f /etc/tender-watch/config.json ]]; then
    sudo --shell /bin/sh -u tender-watch /opt/tender-watch/backend/.venv/bin/python -c \
        "from app.models import Config; print(Config().model_dump_json(indent=2))" \
        > /etc/tender-watch/config.json
    chown root:tender-watch /etc/tender-watch/config.json
    chmod 0640 /etc/tender-watch/config.json
fi

# --- 8. Write backend.env --------------------------------------------------
echo "[8/13] Writing backend.env ..."
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

# --- 9. Build SPA ----------------------------------------------------------
echo "[9/13] Building SPA ..."
if [[ ! -d /opt/tender-watch/frontend ]]; then
    cp -r "$REPO_ROOT/frontend" /opt/tender-watch/
    chown -R tender-watch:tender-watch /opt/tender-watch/frontend
fi
sudo --shell /bin/sh -u tender-watch bash -c '
    cd /opt/tender-watch/frontend
    npm ci
    npm run build
'
rm -rf "$DOCROOT"/*
cp -r /opt/tender-watch/frontend/dist/. "$DOCROOT/"
# Apache runs as www-data on Debian; docroot must be readable + listable.
chown -R www-data:www-data "$DOCROOT"

# --- 10. Apache vhost -----------------------------------------------------
echo "[10/13] Installing Apache vhost ..."
cp "$APACHE_VHOST_SRC" "$APACHE_VHOST_DST"
a2ensite watch.titan-ai.co.za.conf
apache2ctl configtest
systemctl reload apache2

# --- 11. systemd unit + enable --------------------------------------------
echo "[11/13] Installing systemd unit ..."
cp "$REPO_ROOT/deploy/tender-watch-backend.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tender-watch-backend

# --- 12. TLS via certbot ---------------------------------------------------
echo "[12/13] Issuing TLS cert (certbot --apache) ..."
# Idempotent: certbot skips if a valid cert already exists for the domain.
certbot --apache --non-interactive --agree-tos --register-unsafely-without-email \
    -d "$DOMAIN" --redirect || {
    echo "WARNING: certbot did not complete. Check 'certbot certificates' and" >&2
    echo "         'journalctl -u certbot'. Common cause: :80 blocked or DNS not propagated." >&2
    echo "         Re-run this script (or just: sudo certbot --apache -d $DOMAIN)." >&2
}

# --- 13. Smoke test --------------------------------------------------------
echo "[13/13] Smoke test ..."
sleep 2
if curl -fsS --max-time 15 "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    echo "  OK: https://$DOMAIN/api/health is reachable."
else
    echo "WARNING: smoke test failed. Diagnose with:" >&2
    echo "  sudo journalctl -u tender-watch-backend -n 50" >&2
    echo "  sudo journalctl -u apache2 -n 50" >&2
    echo "  sudo apache2ctl configtest" >&2
    echo "  curl -v http://127.0.0.1:$BACKEND_PORT/api/health   # backend direct" >&2
fi

echo ""
echo "=== Install complete ==="
echo ""
echo "URL: https://$DOMAIN"
echo ""
echo "Useful commands:"
echo "  Backend logs:        sudo journalctl -u tender-watch-backend -f"
echo "  Apache logs:        sudo tail -f /var/log/apache2/watch_titan-ai_*.log"
echo "  Edit config JSON:    sudo \$EDITOR /etc/tender-watch/config.json"
echo "  Restart backend:     sudo systemctl restart tender-watch-backend"
echo "  Reload Apache:       sudo systemctl reload apache2"
echo "  Renew certs:         sudo certbot renew --apache"
echo ""
echo "Update the site from your laptop:"
echo "  bash deploy/deploy.sh   # see deploy.sh for SSH-user details"
echo ""
