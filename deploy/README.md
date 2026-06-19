# Deploy

One-shot scripts for deploying Tender Watch.

## `deploy-frontend.ps1`

Deploys the Vite SPA to Vercel from your local machine.

**First run:**
```powershell
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\deploy"
.\deploy-frontend.ps1
```

What it does:
1. Checks Node + npm
2. Installs Vercel CLI globally if missing
3. Logs you in to Vercel (opens browser for OAuth on first run)
4. Sets `VITE_API_BASE` to the Render backend URL
5. Runs `vercel --prod` and prints the deployed URL

**Subsequent runs:**
Just run it again. Re-deploys in seconds (Vercel caches the build).

## Backend (Render)

The backend deploys automatically when you `git push origin main` — Render's Blueprint watches the `main` branch. No script needed for backend deploys.

To change the backend URL, edit `deploy/render.yaml` and push.

## CORS

After the first Vercel deploy, copy the Vercel URL and update the Render backend's `TW_ALLOWED_ORIGINS` env var in the Render dashboard (https://dashboard.render.com → tender-watch-backend → Environment). Render auto-redeploys after the env var change.
