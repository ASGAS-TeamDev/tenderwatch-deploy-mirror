# Tender Watch — Deploy

Single-host deployment at `https://tenderwatch.galactix.co.za`. Caddy
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
11. Smoke-test `https://tenderwatch.galactix.co.za/api/health`.

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

Once the new site is verified at `https://tenderwatch.galactix.co.za`:

1. Log into the Render dashboard → cancel the `tender-watch-backend` service.
2. Log into the Vercel dashboard → delete the `tender-watch` project.

The next code change after that will land the file deletions (vercel.json,
render.yaml, deploy-frontend.ps1) and the README/env-var rewrites.

## Rollback

Until the old Render service is cancelled, the old site is still live.
Setting the A record back to Render's IP restores the old site within
the DNS TTL window (≤5 min).
