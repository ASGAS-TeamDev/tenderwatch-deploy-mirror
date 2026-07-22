#!/usr/bin/env bash
# Tender Watch — laptop → host deploy.
#
# Builds the SPA, rsyncs dist/ and backend/ to 156.38.222.220, then
# restarts the backend. nginx picks up the new dist/ on the next
# request — no nginx reload needed.
#
# Usage:
#   bash deploy/deploy.sh                       # default SSH target (see below)
#   bash deploy/deploy.sh sql@156.38.222.220     # explicit
#   TW_DEPLOY_HOST=sql@156.38.222.220 bash deploy/deploy.sh
#
# SSH auth: this script uses sshpass ONLY if SSHPASS env var is set
# (e.g. `SSHPASS='...' bash deploy/deploy.sh`). Without SSHPASS it relies
# on key-based auth, which is the recommended setup — add your public
# key to the sql user's ~/.ssh/authorized_keys once and forget the
# password. The script never hardcodes a password.

set -euo pipefail

DOMAIN="watch.titan-ai.co.za"
HOST_IP="156.38.222.220"
DEFAULT_USER="sql"

trap 'echo "FATAL: deploy aborted on line $LINENO. $DEPLOY_TARGET:/var/www/watch.titan-ai.co.za/ and $DEPLOY_TARGET:/opt/tender-watch/backend/ may be out of sync — verify with: ssh $DEPLOY_TARGET ls -la /var/www/watch.titan-ai.co.za/ /opt/tender-watch/backend/" >&2' ERR

for tool in rsync ssh npm getent awk; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "FATAL: required tool '$tool' not found in PATH." >&2
        exit 1
    fi
done

if [[ $# -ge 1 ]]; then
    DEPLOY_TARGET="$1"
elif [[ -n "${TW_DEPLOY_HOST:-}" ]]; then
    DEPLOY_TARGET="$TW_DEPLOY_HOST"
else
    DEPLOY_TARGET="${DEFAULT_USER}@${HOST_IP}"
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Choose SSH wrapper: sshpass if SSHPASS is set, plain ssh otherwise.
if [[ -n "${SSHPASS:-}" ]]; then
    if ! command -v sshpass >/dev/null 2>&1; then
        echo "FATAL: SSHPASS is set but sshpass is not installed. Install it or unset SSHPASS to use key auth." >&2
        exit 1
    fi
    SSH_CMD="sshpass -e ssh -o StrictHostKeyChecking=accept-new"
    RSYNC_RSH="sshpass -e ssh -o StrictHostKeyChecking=accept-new"
    export SSHPASS RSYNC_RSH
else
    SSH_CMD="ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"
    RSYNC_RSH="ssh -o StrictHostKeyChecking=accept-new"
    export RSYNC_RSH
fi

echo "=== Tender Watch deploy ==="
echo "Target: $DEPLOY_TARGET"
if [[ -n "${SSHPASS:-}" ]]; then
    echo "Auth:   sshpass (SSHPASS env var)"
else
    echo "Auth:   SSH key (BatchMode=yes). Set SSHPASS for password auth."
fi
echo ""

# Confirm reachability before building (fail fast).
if ! $SSH_CMD "$DEPLOY_TARGET" true; then
    echo "FATAL: cannot reach $DEPLOY_TARGET over SSH." >&2
    if [[ -z "${SSHPASS:-}" ]]; then
        echo "       (key auth failed). Options:" >&2
        echo "         1. Add your public key to the sql user's authorized_keys:" >&2
        echo "            ssh-copy-id $DEPLOY_TARGET" >&2
        echo "         2. Or run with a password: SSHPASS='...' bash deploy/deploy.sh" >&2
    fi
    exit 1
fi

# --- 1. Build SPA ---------------------------------------------------------
echo "[1/3] Building SPA ..."
cd "$REPO_ROOT/frontend"
if [[ ! -f package.json ]]; then
    echo "FATAL: $REPO_ROOT/frontend does not contain package.json — is this the Tender Watch repo?" >&2
    exit 1
fi
npm ci
npm run build
cd "$REPO_ROOT"

# --- 2. rsync ------------------------------------------------------------
echo "[2/3] Syncing ..."
rsync -az --delete "$REPO_ROOT/frontend/dist/" "${DEPLOY_TARGET}:/var/www/watch.titan-ai.co.za/"
rsync -az --delete \
    --exclude .venv --exclude __pycache__ \
    --exclude .pytest_cache --exclude .ruff_cache \
    "$REPO_ROOT/backend/" "${DEPLOY_TARGET}:/opt/tender-watch/backend/"

# Ensure the docroot stays nginx-owned after rsync (rsync preserves
# the laptop's uid, which nginx can't read).
$SSH_CMD "$DEPLOY_TARGET" 'sudo chown -R $(ps -o user= -C nginx | head -1):$(ps -o user= -C nginx | head -1) /var/www/watch.titan-ai.co.za'

# --- 3. Restart backend --------------------------------------------------
echo "[3/3] Restarting backend ..."
$SSH_CMD "$DEPLOY_TARGET" 'sudo systemctl restart tender-watch-backend'
if $SSH_CMD "$DEPLOY_TARGET" 'sudo systemctl is-active --quiet tender-watch-backend'; then
    echo "Backend service is active."
else
    echo "Backend service is NOT active — full status:"
    $SSH_CMD "$DEPLOY_TARGET" 'sudo systemctl --no-pager --full status tender-watch-backend || true'
    exit 1
fi

# --- 4. Smoke test ------------------------------------------------------
echo "[4/4] Smoke test ..."
if curl -fsS --max-time 15 "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    echo "  OK: https://$DOMAIN/api/health is reachable."
else
    echo "WARNING: live smoke test failed (site may still be starting). Check:" >&2
    echo "  https://$DOMAIN/api/health" >&2
fi

echo ""
echo "=== Deploy complete ==="
echo "URL: https://$DOMAIN"