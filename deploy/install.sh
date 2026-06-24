#!/usr/bin/env bash
# Tender Watch — one-time host setup.
#
# Idempotent: skips steps that are already done (re-running this script
# is safe; it will not blow away an existing install).
#
# Usage: sudo bash deploy/install.sh
#
# What it does:
#   1. Pre-flight: verify the A record for tenderwatch.galactix.co.za
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

DOMAIN="tenderwatch.galactix.co.za"
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