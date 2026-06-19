<#
.SYNOPSIS
    Deploy the Tender Watch frontend to Vercel.

.DESCRIPTION
    One-shot script for first-time (and repeat) deploys of the Vite SPA.
    Handles:
      - npm install in ./frontend (if needed)
      - Vercel CLI install (if missing)
      - First-time `vercel login` (you authorize in the browser)
      - First-time project link (interactive prompts; you answer them)
      - Setting VITE_API_BASE (idempotent)
      - Production deploy via `vercel --prod`

    After this script finishes, the production URL is printed at the end.
    You then need to update the Render backend's TW_ALLOWED_ORIGINS env var
    to include the Vercel URL (or do it via the Render dashboard).

.NOTES
    Requires: Node 18+, npm.  Works on Windows PowerShell 5.1+ and pwsh 7+.
#>

$ErrorActionPreference = "Stop"

# --- Paths --------------------------------------------------------------------
$ScriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot     = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$FrontendDir  = Join-Path $RepoRoot "frontend"
$BackendUrl   = "https://tender-watch-backend-gjsz.onrender.com"

Write-Host ""
Write-Host "=== Tender Watch — Vercel deploy ===" -ForegroundColor Cyan
Write-Host "Repo root:    $RepoRoot"
Write-Host "Frontend:     $FrontendDir"
Write-Host "Backend URL:  $BackendUrl"
Write-Host ""

# --- Sanity checks ------------------------------------------------------------
if (-not (Test-Path $FrontendDir)) {
    throw "Frontend folder not found: $FrontendDir"
}
if (-not (Test-Path (Join-Path $FrontendDir "package.json"))) {
    throw "package.json not found in $FrontendDir"
}

# --- 1. Node / npm check ------------------------------------------------------
Write-Host "[1/5] Checking Node + npm..." -ForegroundColor Yellow
$nodeVersion = (node --version) 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "Node.js is not on PATH. Install Node 18+ from https://nodejs.org and retry."
}
$npmVersion = (npm --version) 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "npm is not on PATH. Install Node 18+ (which includes npm) and retry."
}
Write-Host "  node $nodeVersion  npm $npmVersion" -ForegroundColor Green

# --- 2. Vercel CLI ------------------------------------------------------------
Write-Host ""
Write-Host "[2/5] Checking Vercel CLI..." -ForegroundColor Yellow
$vercel = (Get-Command vercel -ErrorAction SilentlyContinue).Source
if (-not $vercel) {
    Write-Host "  Installing vercel globally (this may take a minute)..." -ForegroundColor DarkYellow
    npm install -g vercel
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install Vercel CLI. Try running: npm install -g vercel"
    }
    $vercel = (Get-Command vercel -ErrorAction SilentlyContinue).Source
}
Write-Host "  $vercel" -ForegroundColor Green
& vercel --version | Out-Null

# --- 3. Vercel login ----------------------------------------------------------
Write-Host ""
Write-Host "[3/5] Vercel login..." -ForegroundColor Yellow
# `vercel whoami` exits non-zero when not logged in. Use that as the check.
& vercel whoami *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  You are not logged in. A browser window will open — authorize, then return here." -ForegroundColor DarkYellow
    & vercel login
    if ($LASTEXITCODE -ne 0) {
        throw "vercel login failed. Run 'vercel login' manually and retry this script."
    }
}
$who = & vercel whoami
Write-Host "  Logged in as: $who" -ForegroundColor Green

# --- 4. Set VITE_API_BASE env var (in this shell) -----------------------------
Write-Host ""
Write-Host "[4/5] Setting VITE_API_BASE for the build..." -ForegroundColor Yellow
$env:VITE_API_BASE = $BackendUrl
Write-Host "  VITE_API_BASE = $BackendUrl" -ForegroundColor Green
# Persist it for subsequent shells via a .env.production file (gitignored)
$envFile = Join-Path $FrontendDir ".env.production"
"VITE_API_BASE=$BackendUrl" | Set-Content -Path $envFile -Encoding utf8
Write-Host "  Wrote $envFile" -ForegroundColor DarkGray

# --- 5. Deploy ----------------------------------------------------------------
Write-Host ""
Write-Host "[5/5] Deploying to production..." -ForegroundColor Yellow
Write-Host "  First-time deploy will ask: project setup, scope, project name." -ForegroundColor DarkYellow
Write-Host "  Suggested answers:" -ForegroundColor DarkYellow
Write-Host "    Set up and deploy?     Y" -ForegroundColor DarkGray
Write-Host "    Which scope?           <your account>" -ForegroundColor DarkGray
Write-Host "    Link to existing?      N" -ForegroundColor DarkGray
Write-Host "    Project name?          tender-watch" -ForegroundColor DarkGray
Write-Host "    Directory?             ./  (press Enter)" -ForegroundColor DarkGray
Write-Host ""

Push-Location $FrontendDir
try {
    & vercel --prod --yes
    if ($LASTEXITCODE -ne 0) {
        throw "vercel --prod failed (exit $LASTEXITCODE)"
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "=== Deploy complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "NEXT STEP: copy the Vercel URL printed above, then in the Render dashboard" -ForegroundColor Cyan
Write-Host "(https://dashboard.render.com) update the backend's environment:" -ForegroundColor Cyan
Write-Host "  TW_ALLOWED_ORIGINS = <paste the Vercel URL here>" -ForegroundColor Cyan
Write-Host ""
Write-Host "After saving the env var, Render auto-redeploys (~1 minute)." -ForegroundColor Cyan
Write-Host "Then open the Vercel URL in your browser and enjoy." -ForegroundColor Cyan
Write-Host ""
Write-Host "Heads-up: the first request to the backend will cold-start (~60s)." -ForegroundColor DarkYellow
Write-Host "Subsequent requests are fast (cache + warm instance)." -ForegroundColor DarkYellow
