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

trap 'echo "FATAL: deploy aborted on line $LINENO. $DEPLOY_TARGET:/var/www/tender-watch/ and $DEPLOY_TARGET:/opt/tender-watch/backend/ may be out of sync — verify with: ssh $DEPLOY_TARGET ls -la /var/www/tender-watch/ /opt/tender-watch/backend/" >&2' ERR

for tool in rsync ssh npm getent awk; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "FATAL: required tool '$tool' not found in PATH." >&2
        exit 1
    fi
done

DOMAIN="tenderwatch.galactix.co.za"

if [[ $# -ge 1 ]]; then
    DEPLOY_TARGET="$1"
elif [[ -n "${TW_DEPLOY_HOST:-}" ]]; then
    DEPLOY_TARGET="$TW_DEPLOY_HOST"
else
    # Pick the first A record (rsync target uses the IP, not a hostname).
    HOST_IP="$(getent hosts "$DOMAIN" | awk '{print $1; exit}')"
    if [[ -z "${HOST_IP:-}" ]]; then
        echo "FATAL: $DOMAIN does not resolve. Cannot determine the host IP." >&2
        exit 1
    fi
    DEPLOY_TARGET="tender-watch@${HOST_IP}"
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$DEPLOY_TARGET" true; then
    echo "FATAL: cannot reach $DEPLOY_TARGET over SSH. Check that your public key is in the host's authorized_keys." >&2
    exit 1
fi

echo "=== Tender Watch deploy ==="
echo "Target: $DEPLOY_TARGET"
echo ""

# --- 1. Build SPA -----------------------------------------------------------
echo "[1/3] Building SPA ..."
cd "$REPO_ROOT/frontend"
if [[ ! -f package.json ]]; then
    echo "FATAL: $REPO_ROOT/frontend does not contain package.json — is this the Tender Watch repo?" >&2
    exit 1
fi
# npm ci (not npm install) — fails fast if package-lock.json is out of sync.
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
ssh "$DEPLOY_TARGET" 'sudo systemctl restart tender-watch-backend'
if ssh "$DEPLOY_TARGET" 'sudo systemctl is-active --quiet tender-watch-backend'; then
    echo "Backend service is active."
else
    echo "Backend service is NOT active — full status:"
    ssh "$DEPLOY_TARGET" 'sudo systemctl --no-pager --full status tender-watch-backend || true'
    exit 1
fi

echo ""
echo "=== Deploy complete ==="
echo "URL: https://$DOMAIN"
