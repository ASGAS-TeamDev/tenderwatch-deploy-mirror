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

DOMAIN="tenderwatch.galactix.co.za"

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
