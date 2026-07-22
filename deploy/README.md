# Tender Watch — Deploy

Single-host deployment at **`https://watch.titan-ai.co.za`**, hosted on
`156.38.222.220` (the shared xneelo nginx VPS that also runs
`app/api/n8n.titan-ai.co.za`).

nginx terminates TLS (Let's Encrypt via `certbot --nginx`), serves the
static Vite `dist/`, and reverse-proxies `/api/*` to uvicorn on
`127.0.0.1:8001`. `systemd` supervises uvicorn.

```
Browser (HTTPS, watch.titan-ai.co.za)
    │
    ▼
nginx vhost (:443, Let's Encrypt via certbot --nginx)
    ├── /api/*  → 127.0.0.1:8001  (uvicorn, systemd unit tender-watch-backend)
    └── /*      → /var/www/watch.titan-ai.co.za/  (Vite dist)
```

## Files in this folder

- `nginx/watch.titan-ai.co.za.conf` — nginx vhost. Installed to
  `/etc/nginx/sites-available/watch.titan-ai.co.za.conf` (symlinked into
  `/etc/nginx/sites-enabled/`).
- `tender-watch-backend.service` — systemd unit. Installed to
  `/etc/systemd/system/tender-watch-backend.service`.
- `install.sh` — first-time host setup. Run once per host with `sudo`.
- `deploy.sh` — laptop → host updates. Run from your dev machine.
- `README.md` — this file.

## First-time setup on the host

### 0. DNS (do this first, ≥24h before install)

Add an **A record** in xneelo DNS:

```
watch.titan-ai.co.za  A  300  156.38.222.220
```

Lower TTL to 300s at least 24h before cutover so the DNS switch
propagates in ≤5 min. `install.sh` preflight aborts if the A record
doesn't resolve to the host's public IP.

### 1. Get the repo onto the host

From your laptop:

```bash
ssh sql@156.38.222.220
git clone https://github.com/ASGAS-TeamDev/TenderWatch.git ~/TenderWatch
cd ~/TenderWatch
```

### 2. Run install.sh with sudo

```bash
ssh sql@156.38.222.220
cd ~/TenderWatch   # or wherever you cloned it
sudo bash deploy/install.sh
```

The install script is idempotent. It will:

1. Pre-flight: confirm root, DNS resolves to this host, `:8001` is free.
2. Install OS packages (Python 3.12 + rsync + node + certbot-nginx).
3. Create the `tender-watch` system user.
4. Create app / config / docroot / log directories.
5. Set up `/opt/tender-watch/backend/.venv` and install backend deps.
6. Seed `/etc/tender-watch/config.json` with `Config()` defaults.
7. Write `/etc/tender-watch/backend.env` (same-origin; `TW_ALLOWED_ORIGINS=""`).
8. Build the SPA and copy `dist/` to `/var/www/watch.titan-ai.co.za/`.
9. Install the nginx vhost, symlink into `sites-enabled`, `nginx -t`, reload.
10. Install the systemd unit and enable + start `tender-watch-backend`.
11. Issue the TLS cert via `certbot --nginx -d watch.titan-ai.co.za --redirect`.
12. Smoke-test `https://watch.titan-ai.co.za/api/health`.

## Updating the site

From your laptop, after a code change:

```bash
# Key-based auth (recommended — set up once with `ssh-copy-id sql@156.38.222.220`):
bash deploy/deploy.sh

# Or with a password (no key needed):
SSHPASS='your-password' bash deploy/deploy.sh

# Or override the SSH target:
bash deploy/deploy.sh sql@156.38.222.220
TW_DEPLOY_HOST=sql@156.38.222.220 bash deploy/deploy.sh
```

The deploy script builds the SPA, rsyncs `dist/` and `backend/` to the
host, fixes docroot ownership, and restarts the backend. nginx does not
need a reload — it picks up the new `dist/` files on next request.

## Daily ops

```bash
# Tail backend logs:
sudo journalctl -u tender-watch-backend -f

# Tail nginx logs for this site:
sudo tail -f /var/log/nginx/watch_titan-ai_*.log

# Edit the user-editable filter config (any text editor):
sudo $EDITOR /etc/tender-watch/config.json
# Read fresh on every /api/matches request — no restart needed.

# Reload nginx after editing the vhost manually:
sudo systemctl reload nginx

# Restart the backend (e.g. after editing backend.env):
sudo systemctl restart tender-watch-backend
```

## Backing up

There is one piece of persistent state: `/etc/tender-watch/config.json`.
It contains the user's keywords, buyer allowlist, lookback window, and
thresholds. Back it up however the rest of your `/etc/` is backed up.

There is no database and no cache file — the in-memory TTL cache is
rebuilt on each process restart.

## Rollback

If a deploy breaks the site, the previous `dist/` is gone (rsync
`--delete`). Recovery options:

1. Revert the code in git, `npm run build`, and re-run `deploy.sh`.
2. SSH in and restore from your last manual snapshot of
   `/var/www/watch.titan-ai.co.za/` (if you took one).

For a fast rollback lane, consider snapshotting the docroot before
each deploy:

```bash
ssh sql@156.38.222.220 'sudo cp -a /var/www/watch.titan-ai.co.za /var/www/watch.titan-ai.co.za.bak.$(date +%s)'
```

## Port choice

uvicorn binds `127.0.0.1:8001`. `:8000` (default) and `:3000` (the TITAN
Node API on this box) are avoided. If `:8001` is ever taken, the
install preflight aborts and tells you how to change it
(`deploy/tender-watch-backend.service` + `deploy/nginx/watch.titan-ai.co.za.conf`).

## TLS renewals

`certbot` installs a systemd timer (`certbot.timer`) that auto-renews
all certs. Verify it's active:

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run   # test the renewal flow
```