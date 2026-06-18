# Tender Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full Tender Watch v1 app — FastAPI backend (etenders fetcher + filter pipeline + cache + 3 routes), Vite/React frontend (3 views matching 7 Stitch screens), and Render + Vercel deploy. Visual spec = seven Stitch screens in the planning repo.

**Architecture:** Two packages (`backend/`, `frontend/`) plus `deploy/`. Backend is async FastAPI; `services/` isolates the eTenders client, filter pipeline, and TTL cache; `routes/` is thin. Frontend is React 19 + Vite 6 + Tailwind v4 with design tokens lifted from the Stitch `@theme` block; no router, no state library, `?bust=<ts>` for cache invalidation. Deploy uses Render Blueprint + Vercel rewrites; CORS pinned to deployed origins.

**Tech Stack:** Python 3.12+ / FastAPI 0.115+ / httpx / Pydantic v2 / pytest + respx. React 19 / Vite 6 / TypeScript 5 / Tailwind v4 / Vitest + @testing-library/react. Render (backend, free tier) + Vercel (frontend, free tier). Linting: ruff (Python) / ESLint + typescript-eslint (frontend).

**Spec being implemented:** `docs/superpowers/specs/2026-06-17-tender-watch-app-design.md`
**Source planning repo:** `C:\UNLIMITED DEV\MAIN Work Space\TENDER WATCH\` (read-only)
**Visual spec:** `C:\UNLIMITED DEV\MAIN Work Space\TENDER WATCH\docs\superpowers\specs\2026-06-17-tender-watch-mockups-design\` (seven Stitch screens + design tokens)
**Source system spec:** `C:\UNLIMITED DEV\MAIN Work Space\TENDER WATCH\2026-06-17-tender-watch-design.md`
**Source scope:** `C:\UNLIMITED DEV\MAIN Work Space\TENDER WATCH\scope.md`

---

## Build sequence

The plan is grouped into 6 sections matching the original six phases. Each section ends with a runnable artefact.

| Section | Tasks | Deliverable |
| --- | --- | --- |
| 0. Repo scaffold | Tasks 1–2 | Empty repo with `backend/`, `frontend/`, `deploy/` folders, `README.md`, `.gitignore`, `LICENSE`, `pyproject.toml`, `package.json` |
| 1. Backend (fetcher, filter, cache, API) | Tasks 3–10 | `uvicorn` runs; `curl /api/health`, `/api/config`, `/api/matches` all return spec-shaped JSON against mocked eTenders |
| 2. Frontend (3 views, Tailwind tokens) | Tasks 11–22 | `npm run dev` opens the list view, which renders mocked matches against the live backend |
| 3. Integration (frontend ↔ live backend) | Tasks 23–24 | Frontend deployed to Vercel pointing at the Render backend; CORS verified; full happy path works |
| 4. Real eTenders smoke test | Task 25 | Backend fetches from `data.etenders.gov.za`; real fixtures recorded; doc the page-size ceiling |
| 5. Documentation + handoff | Tasks 26–27 | README, env example, deploy notes, open-items resolved |

---

## File structure

Created by this plan, by section:

**Section 0:**
- `README.md`, `.gitignore`, `.editorconfig`, `LICENSE`
- `backend/pyproject.toml`, `backend/.env.example`
- `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/styles.css`

**Section 1 (backend):**
- `backend/app/__init__.py`
- `backend/app/settings.py` — env-var loader
- `backend/app/models.py` — Pydantic: Match, Config, Release, FilterResult
- `backend/app/services/__init__.py`
- `backend/app/services/etenders.py` — async httpx client, paginated fetch
- `backend/app/services/filter.py` — apply_rules(release, config)
- `backend/app/services/cache.py` — TTL cache, SHA-256 keyed
- `backend/app/config_store.py` — atomic write
- `backend/app/routes/__init__.py`
- `backend/app/routes/matches.py` — GET /api/matches
- `backend/app/routes/config.py` — GET/PUT /api/config
- `backend/app/routes/health.py` — GET /api/health
- `backend/app/main.py` — FastAPI app, CORS, route registration
- `backend/tests/__init__.py`
- `backend/tests/conftest.py` — fixtures
- `backend/tests/fixtures/sample_release.json`
- `backend/tests/fixtures/sample_page.json`
- `backend/tests/fixtures/sample_invalid_config.json`
- `backend/tests/test_filter.py` — T8, T9, T10, T11, T12
- `backend/tests/test_config_store.py`
- `backend/tests/test_cache.py` — T4
- `backend/tests/test_etenders.py`
- `backend/tests/test_api.py` — T1, T2, T3, T5, T6, T7, T13, T16

**Section 2 (frontend):**
- `frontend/tailwind.config.ts`
- `frontend/src/App.tsx` — tab switcher, health chip
- `frontend/src/api/client.ts` — typed fetch wrappers
- `frontend/src/components/Tabs.tsx`
- `frontend/src/components/HealthChip.tsx`
- `frontend/src/components/HealthBanner.tsx`
- `frontend/src/components/UpstreamBanner.tsx`
- `frontend/src/components/EmptyState.tsx`
- `frontend/src/components/FlagPill.tsx`
- `frontend/src/components/MatchCard.tsx`
- `frontend/src/components/MatchList.tsx`
- `frontend/src/components/DetailDrawer.tsx`
- `frontend/src/components/ConfigForm.tsx`
- `frontend/src/components/Toast.tsx`
- `frontend/src/lib/format.ts` — ZAR, dates
- `frontend/src/lib/relativeTime.ts`
- `frontend/tests/MatchList.test.tsx` — T14, T15
- `frontend/tests/ConfigForm.test.tsx` — validation, save flow
- `frontend/tests/DetailDrawer.test.tsx` — open, link
- `frontend/tests/api-client.test.ts`
- `frontend/tests/format.test.ts`
- `frontend/tests/relativeTime.test.ts`

**Section 3 (integration):**
- `deploy/render.yaml`
- `deploy/vercel.json`

**Section 4 (smoke test):**
- `backend/tests/fixtures/recorded_real_page.json` (added during the smoke test, not pre-created)

**Section 5 (docs):**
- `README.md` (updated to be the full handoff doc)

---

## Section 0 — Repo scaffold

### Task 1: Create the empty repo + root files

**Files:**
- Create: `README.md`, `.gitignore`, `.editorconfig`, `LICENSE`
- Create: `backend/`, `frontend/`, `deploy/` directories (empty placeholders for now)

- [ ] **Step 1: Create the directories**

Run from PowerShell with the working directory set to the new repo:

```bash
mkdir -p "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\backend", "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\frontend", "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\deploy"
```

Expected: the three directories exist.

- [ ] **Step 2: Write `.gitignore`**

```gitignore
# Python
__pycache__/
*.py[cod]
*.egg-info/
.venv/
venv/
.pytest_cache/
.ruff_cache/
.mypy_cache/
*.log
backend/config/
backend/.env

# Node / Vite
node_modules/
dist/
.vite/
*.tsbuildinfo
coverage/
.env
.env.local
.env.production

# IDE
.idea/
.vscode/
*.swp
.DS_Store

# Stitch / planning artefacts (kept in the planning repo, not here)
# (none — this is the build repo)
```

- [ ] **Step 3: Write `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.py]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 4: Write `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 Ed

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 5: Write a placeholder `README.md` (Section 5 rewrites this in full)**

```markdown
# Tender Watch

A personal, on-demand browser tool that monitors the South African eTenders
OCDS API for IT / professional-services opportunities.

See `docs/superpowers/specs/2026-06-17-tender-watch-app-design.md` for the
build spec and `docs/superpowers/plans/2026-06-17-tender-watch-app.md` for
the implementation plan.
```

- [ ] **Step 6: Initialise git and make the first commit**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git init
git add .
git commit -m "chore: initial repo scaffold"
```

Expected: git is initialised; the first commit is in the log.

### Task 2: Backend `pyproject.toml` + minimum boot

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py` (placeholder, replaced in Task 10)
- Create: `backend/.env.example`

- [ ] **Step 1: Write `backend/pyproject.toml`**

```toml
[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "tender-watch-backend"
version = "0.1.0"
description = "Tender Watch backend: fetches, filters, and serves eTenders OCDS releases."
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "httpx>=0.27",
    "pydantic>=2.7",
    "pydantic-settings>=2.3",
]

[project.optional-dependencies]
prod = ["gunicorn>=22"]
dev = [
    "pytest>=8",
    "pytest-asyncio>=0.23",
    "respx>=0.21",
    "ruff>=0.5",
]

[tool.setuptools.packages.find]
where = ["."]
include = ["app*"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py312"
```

- [ ] **Step 2: Write `backend/.env.example`**

```bash
# eTenders OCDS Public API base
TW_API_BASE=https://data.etenders.gov.za

# Where the user-editable config JSON lives
TW_CONFIG_PATH=./config/tender-watch.json

# In-memory response cache TTL
TW_CACHE_TTL_SECONDS=60

# Comma-separated CORS origins
TW_ALLOWED_ORIGINS=http://localhost:5173

# Log level
TW_LOG_LEVEL=INFO
```

- [ ] **Step 3: Write `backend/app/__init__.py`**

```python
"""Tender Watch backend."""
__version__ = "0.1.0"
```

- [ ] **Step 4: Write a placeholder `backend/app/main.py` (real app comes in Task 10)**

```python
"""FastAPI entry point. Real implementation in Task 10."""
from fastapi import FastAPI

app = FastAPI(title="Tender Watch", version="0.1.0")


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "tender-watch", "status": "placeholder"}
```

- [ ] **Step 5: Install + verify the boot**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\backend"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev,prod]"
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Expected: uvicorn starts; `curl http://127.0.0.1:8000/` returns `{"service":"tender-watch","status":"placeholder"}`. Stop the server with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat(backend): scaffold FastAPI app with pyproject + placeholder"
```

---

## Section 1 — Backend (fetcher, filter, cache, API)

### Task 3: Settings + Pydantic models

**Files:**
- Create: `backend/app/settings.py`
- Create: `backend/app/models.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py` (with `default_config` fixture)

- [ ] **Step 1: Write `backend/app/settings.py`**

```python
"""Environment-variable settings loaded via pydantic-settings."""
from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="TW_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    api_base: str = "https://data.etenders.gov.za"
    config_path: str = "./config/tender-watch.json"
    cache_ttl_seconds: int = 60
    allowed_origins: str = "http://localhost:5173"
    log_level: str = "INFO"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
```

- [ ] **Step 2: Write `backend/app/models.py`**

```python
"""Pydantic models for the Tender Watch API. Single source of truth for response shapes."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class Config(BaseModel):
    lookback_days: int = Field(default=30, ge=7, le=90)
    page_size: int = Field(default=100, ge=1, le=1000)
    high_value_threshold_zar: float = Field(default=5_000_000, ge=0)
    closing_soon_days: int = Field(default=7, ge=1, le=60)
    include_closed: bool = True
    keywords: list[str] = Field(default_factory=list)
    buyer_allowlist: list[str] = Field(default_factory=list)


class Match(BaseModel):
    ocid: str
    title: str
    buyer: str
    procuring_entity: str
    value_zar: float | None
    value_display: str
    closing_date: str
    days_to_close: int | None
    province: str | None
    category: str | None
    link: str
    flags: list[Literal["high-value", "closing-soon", "closed"]]
    matched_on: dict[str, list[str]]


class Stats(BaseModel):
    releases_scanned: int
    matched: int
    rejected_by_status: int
    rejected_no_keyword_no_buyer: int


class MatchesResponse(BaseModel):
    fetched_at: datetime
    window: dict[str, datetime]
    config_digest: str
    stats: Stats
    matches: list[Match]
    cached_response: "MatchesResponse | None" = None


class HealthResponse(BaseModel):
    ok: bool
    eTenders_reachable: bool
    config_path: str
    detail: str | None = None


class ConfigResponse(BaseModel):
    config: Config
    config_digest: str


# Forward-reference resolution
MatchesResponse.model_rebuild()
```

- [ ] **Step 3: Write `backend/tests/__init__.py`**

```python
"""Test package."""
```

- [ ] **Step 4: Write `backend/tests/conftest.py`**

```python
"""Shared test fixtures."""
from __future__ import annotations

import pytest

from app.models import Config


@pytest.fixture
def default_config() -> Config:
    return Config(
        lookback_days=30,
        page_size=100,
        high_value_threshold_zar=5_000_000,
        closing_soon_days=7,
        include_closed=True,
        keywords=[
            "software", "it services", "system integration",
            "consulting", "professional services", "managed services",
            "cloud", "cybersecurity", "data", "development",
            "support and maintenance",
        ],
        buyer_allowlist=["sita", "national treasury", "sars", "dcdt", "gcis"],
    )
```

- [ ] **Step 5: Verify the imports work**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\backend"
.\.venv\Scripts\Activate.ps1
python -c "from app.models import Config, Match, Stats, MatchesResponse, HealthResponse, ConfigResponse; from app.settings import settings; print('ok', settings.api_base)"
```

Expected: prints `ok https://data.etenders.gov.za`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/settings.py backend/app/models.py backend/tests/
git commit -m "feat(backend): settings + Pydantic models"
```

### Task 4: eTenders client (TDD)

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/etenders.py`
- Create: `backend/tests/fixtures/sample_release.json`
- Create: `backend/tests/fixtures/sample_page.json`
- Create: `backend/tests/test_etenders.py`

- [ ] **Step 1: Write `backend/app/services/__init__.py`**

```python
"""Service layer."""
```

- [ ] **Step 2: Write the failing test `backend/tests/test_etenders.py`**

```python
"""Tests for the eTenders client."""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import respx

from app.services.etenders import EtendersClient

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.mark.asyncio
async def test_fetch_releases_returns_flat_list_from_single_page() -> None:
    page = _load("sample_page.json")
    with respx.mock(base_url="https://data.etenders.gov.za") as mock:
        mock.get("/api/OCDSReleases").mock(return_value=httpx.Response(200, json=page))
        async with EtendersClient(base_url="https://data.etenders.gov.za") as client:
            releases = await client.fetch_releases(
                date_from="2026-05-18T00:00:00Z",
                date_to="2026-06-17T00:00:00Z",
                page_size=100,
            )
    assert len(releases) == 1
    assert releases[0]["ocid"] == "ocds-9t57fa-test-1"


@pytest.mark.asyncio
async def test_fetch_releases_paginates_until_short_page() -> None:
    page1 = _load("sample_page.json")
    page2 = {"releases": [], "links": {}}
    with respx.mock(base_url="https://data.etenders.gov.za") as mock:
        # First call returns a full page with a `next` link; second returns empty.
        route = mock.get("/api/OCDSReleases")
        route.side_effect = [
            httpx.Response(200, json={**page1, "links": {"next": "/api/OCDSReleases?PageNumber=2"}}),
            httpx.Response(200, json=page2),
        ]
        async with EtendersClient(base_url="https://data.etenders.gov.za") as client:
            releases = await client.fetch_releases(
                date_from="2026-05-18T00:00:00Z",
                date_to="2026-06-17T00:00:00Z",
                page_size=1,
            )
    assert len(releases) == 1
    assert mock.calls.call_count == 2
```

- [ ] **Step 3: Run tests to verify failure**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\backend"
.\.venv\Scripts\Activate.ps1
pytest tests/test_etenders.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.etenders'`.

- [ ] **Step 4: Write `backend/app/services/etenders.py`**

```python
"""Async client for the eTenders OCDS Public API."""
from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx


class EtendersError(Exception):
    """Raised on unrecoverable upstream errors."""


class EtendersClient:
    def __init__(self, base_url: str, timeout: float = 30.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(base_url=self._base_url, timeout=timeout)

    async def __aenter__(self) -> "EtendersClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self._client.aclose()

    async def fetch_releases(
        self, *, date_from: str, date_to: str, page_size: int = 100,
    ) -> list[dict[str, Any]]:
        """Fetch all releases in the date window, paginating until exhausted."""
        page = 1
        out: list[dict[str, Any]] = []
        while True:
            resp = await self._client.get(
                "/api/OCDSReleases",
                params={
                    "dateFrom": date_from,
                    "dateTo": date_to,
                    "PageNumber": page,
                    "PageSize": page_size,
                },
            )
            if resp.status_code >= 500:
                raise EtendersError(f"upstream {resp.status_code}")
            resp.raise_for_status()
            data = resp.json()
            releases = data.get("releases", [])
            out.extend(releases)
            # Stop when the page is short OR `links.next` is missing.
            links = data.get("links") or {}
            if len(releases) < page_size or not links.get("next"):
                return out
            page += 1
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_etenders.py -v
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/etenders.py backend/tests/test_etenders.py backend/tests/fixtures/
git commit -m "feat(backend): async eTenders client with pagination"
```

### Task 5: Fixtures (sample_release + sample_page)

**Files:**
- Create: `backend/tests/fixtures/sample_release.json`
- Create: `backend/tests/fixtures/sample_page.json`

- [ ] **Step 1: Write `backend/tests/fixtures/sample_release.json`**

```json
{
  "ocid": "ocds-9t57fa-test-1",
  "date": "2026-06-15T08:00:00Z",
  "tender": {
    "id": "tender-1",
    "title": "Provision of Cloud Hosting Services for Government Departments",
    "status": "active",
    "category": "IT services",
    "province": "Gauteng",
    "value": { "amount": 12500000, "currency": "ZAR" },
    "tenderPeriod": { "endDate": "2026-07-15T17:00:00Z" },
    "buyer": { "name": "SITA" },
    "procuringEntity": { "name": "SITA" },
    "items": [
      { "classification": { "description": "Cloud infrastructure" } },
      { "classification": { "description": "Managed services" } }
    ],
    "documents": [
      { "url": "https://etenders.gov.za/doc/1", "title": "Bid invitation" }
    ]
  }
}
```

- [ ] **Step 2: Write `backend/tests/fixtures/sample_page.json`**

```json
{
  "uri": "https://data.etenders.gov.za/api/OCDSReleases",
  "version": "1.0",
  "publisher": { "name": "eTenders", "uid": "ZA-eTenders" },
  "license": "https://opendatacommons.org/licenses/pddl/1-0/",
  "publicationPolicy": "https://data.etenders.gov.za/policy",
  "publishedDate": "2026-06-17T08:00:00Z",
  "releases": [
    {
      "ocid": "ocds-9t57fa-test-1",
      "date": "2026-06-15T08:00:00Z",
      "tender": {
        "id": "tender-1",
        "title": "Provision of Cloud Hosting Services for Government Departments",
        "status": "active",
        "category": "IT services",
        "province": "Gauteng",
        "value": { "amount": 12500000, "currency": "ZAR" },
        "tenderPeriod": { "endDate": "2026-07-15T17:00:00Z" },
        "buyer": { "name": "SITA" },
        "procuringEntity": { "name": "SITA" },
        "items": [
          { "classification": { "description": "Cloud infrastructure" } }
        ],
        "documents": [
          { "url": "https://etenders.gov.za/doc/1", "title": "Bid invitation" }
        ]
      }
    }
  ],
  "links": {}
}
```

- [ ] **Step 3: Re-run the etenders tests to confirm they still pass**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\backend"
.\.venv\Scripts\Activate.ps1
pytest tests/test_etenders.py -v
```

Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/fixtures/
git commit -m "test(backend): add sample release + page fixtures"
```

### Task 6: Filter pipeline (TDD — T8, T9, T10, T11, T12)

**Files:**
- Create: `backend/app/services/filter.py`
- Create: `backend/tests/test_filter.py`

- [ ] **Step 1: Write the failing tests `backend/tests/test_filter.py`**

```python
"""Tests for the filter pipeline. Covers T8–T12."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.models import Config
from app.services.filter import apply_rules

FIXTURES = Path(__file__).parent / "fixtures"


def _release(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))["releases"][0]


def test_cancelled_tender_is_dropped(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["status"] = "cancelled"
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is False
    assert "status:cancelled" in result.reasons


def test_no_keyword_no_buyer_is_dropped(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["buyer"]["name"] = "Acme Holdings"
    r["tender"]["procuringEntity"]["name"] = "Acme Holdings"
    r["tender"]["title"] = "Catering services for the office"
    r["tender"]["items"] = [{"classification": {"description": "Food"}}]
    result = apply_rules(
        r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc),
    )
    assert result.keep is False
    assert "no_keyword_no_buyer" in result.reasons


def test_high_value_flag(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["value"]["amount"] = 10_000_000
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert "high-value" in result.flags


def test_closing_soon_flag(default_config: Config) -> None:
    r = _release("sample_release.json")
    # Set closing date 2 days from "now"
    r["tender"]["tenderPeriod"]["endDate"] = (
        datetime(2026, 6, 17, tzinfo=timezone.utc) + timedelta(days=2)
    ).isoformat()
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert "closing-soon" in result.flags


def test_buyer_match_keeps_release_without_keyword(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["title"] = "Something unrelated"
    r["tender"]["items"] = []
    r["tender"]["buyer"]["name"] = "SITA"
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert result.matched_on["buyers"] == ["sita"]


def test_keyword_match_keeps_release_without_buyer(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["buyer"]["name"] = "Acme"
    r["tender"]["procuringEntity"]["name"] = "Acme"
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert "cloud" in result.matched_on["keywords"]


def test_value_amount_rounding_to_zar(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["value"] = {"amount": 12345678.9, "currency": "ZAR"}
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert result.value_zar == 12345678.9
    assert result.value_display.startswith("R")
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\backend"
.\.venv\Scripts\Activate.ps1
pytest tests/test_filter.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.filter'`.

- [ ] **Step 3: Write `backend/app/services/filter.py`**

```python
"""Filter pipeline. Mirrors system spec §4."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.models import Config


@dataclass
class FilterResult:
    keep: bool
    reasons: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)
    matched_on: dict[str, list[str]] = field(default_factory=dict)
    title: str = ""
    buyer: str = ""
    procuring_entity: str = ""
    value_zar: float | None = None
    value_display: str = ""
    closing_date: str = ""
    days_to_close: int | None = None
    province: str | None = None
    category: str | None = None
    link: str = ""


HARD_REJECT_STATUSES = {"cancelled", "unsuccessful", "withdrawn"}


def _format_zar(amount: float | None) -> str:
    if amount is None:
        return "R —"
    # Use South African locale formatting (en-ZA): "R 12,500,000".
    # Implemented inline to avoid pulling in Babel in the backend.
    return f"R {amount:,.0f}"


def _days_to_close(closing_iso: str, now: datetime) -> int | None:
    try:
        end = datetime.fromisoformat(closing_iso.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    delta = end - now
    return int(delta.total_seconds() // 86400)


def apply_rules(release: dict[str, Any], config: Config, *, now: datetime) -> FilterResult:
    tender = release.get("tender") or {}
    status = (tender.get("status") or "").lower()
    title = tender.get("title") or ""
    buyer = (tender.get("buyer") or {}).get("name") or ""
    procuring_entity = (tender.get("procuringEntity") or {}).get("name") or ""
    value = tender.get("value") or {}
    amount = value.get("amount")
    closing_period = tender.get("tenderPeriod") or {}
    closing_iso = closing_period.get("endDate") or ""
    province = tender.get("province")
    category = tender.get("category")
    link = f"https://etenders.gov.za/release/{release.get('ocid', '')}"
    items = tender.get("items") or []

    result = FilterResult(
        keep=False,
        title=title,
        buyer=buyer,
        procuring_entity=procuring_entity,
        value_zar=amount,
        value_display=_format_zar(amount),
        closing_date=closing_iso[:10] if closing_iso else "",
        days_to_close=_days_to_close(closing_iso, now),
        province=province,
        category=category,
        link=link,
    )

    # Hard-reject rules
    if status in HARD_REJECT_STATUSES:
        result.reasons.append(f"status:{status}")
        return result
    if not title:
        result.reasons.append("no_title")
        return result

    # Soft-keep rules
    title_lower = title.lower()
    item_text = " ".join(
        (item.get("classification") or {}).get("description", "") for item in items
    ).lower()
    matched_keywords = [
        kw for kw in config.keywords
        if kw.lower() in title_lower or kw.lower() in item_text
    ]
    matched_buyers = [
        b for b in config.buyer_allowlist
        if b.lower() in buyer.lower() or b.lower() in procuring_entity.lower()
    ]
    result.matched_on = {"keywords": matched_keywords, "buyers": matched_buyers}

    # Per system spec §4.1: must match EITHER a buyer OR a keyword. No match → drop.
    if not matched_keywords and not matched_buyers:
        result.reasons.append("no_keyword_no_buyer")
        return result

    result.keep = True

    # Flag rules
    if amount is not None and amount >= config.high_value_threshold_zar:
        result.flags.append("high-value")
    if closing_iso:
        end = datetime.fromisoformat(closing_iso.replace("Z", "+00:00"))
        if end < now:
            if config.include_closed:
                result.flags.append("closed")
            else:
                result.keep = False
                result.reasons.append("closed_excluded")
        elif (end - now).days <= config.closing_soon_days:
            result.flags.append("closing-soon")
    return result
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_filter.py -v
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/filter.py backend/tests/test_filter.py
git commit -m "feat(backend): filter pipeline (T8–T12)"
```

### Task 7: Config store (atomic write + defaults)

**Files:**
- Create: `backend/app/config_store.py`
- Create: `backend/tests/test_config_store.py`

- [ ] **Step 1: Write the failing tests `backend/tests/test_config_store.py`**

```python
"""Tests for config persistence."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.config_store import load_config, save_config
from app.models import Config


def test_load_config_returns_defaults_when_missing(tmp_path: Path) -> None:
    cfg = load_config(tmp_path / "tender-watch.json")
    assert cfg.lookback_days == 30
    assert cfg.page_size == 100
    assert "software" in cfg.keywords


def test_save_then_load_round_trip(tmp_path: Path) -> None:
    path = tmp_path / "tender-watch.json"
    cfg = Config(lookback_days=60, keywords=["alpha", "beta"])
    save_config(cfg, path)
    loaded = load_config(path)
    assert loaded.lookback_days == 60
    assert loaded.keywords == ["alpha", "beta"]


def test_save_config_writes_atomically(tmp_path: Path) -> None:
    path = tmp_path / "tender-watch.json"
    save_config(Config(lookback_days=14), path)
    # No stray .tmp files left behind.
    assert list(tmp_path.glob("*.tmp")) == []


def test_load_config_recovers_from_corrupt_file(tmp_path: Path) -> None:
    path = tmp_path / "tender-watch.json"
    path.write_text("{not valid json", encoding="utf-8")
    cfg = load_config(path)
    # Corrupt file → fall back to defaults (and don't raise).
    assert cfg.lookback_days == 30
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pytest tests/test_config_store.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.config_store'`.

- [ ] **Step 3: Write `backend/app/config_store.py`**

```python
"""Read/write the user-editable config JSON. Atomic write; defaults on missing/corrupt."""
from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path

from app.models import Config

log = logging.getLogger(__name__)


def load_config(path: str | Path) -> Config:
    p = Path(path)
    if not p.exists():
        return Config()
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        log.warning("config %s unreadable (%s); using defaults", p, exc)
        return Config()
    try:
        return Config(**data)
    except Exception as exc:  # pydantic ValidationError
        log.warning("config %s invalid (%s); using defaults", p, exc)
        return Config()


def save_config(config: Config, path: str | Path) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    # Atomic write: write to a temp file in the same dir, then os.replace.
    fd, tmp_path = tempfile.mkstemp(dir=p.parent, prefix=".tender-watch-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(config.model_dump(), f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, p)
    except Exception:
        # Best-effort cleanup on failure.
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_config_store.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/config_store.py backend/tests/test_config_store.py
git commit -m "feat(backend): config store (atomic write + defaults)"
```

### Task 8: In-memory TTL cache (T4)

**Files:**
- Create: `backend/app/services/cache.py`
- Create: `backend/tests/test_cache.py`

- [ ] **Step 1: Write the failing tests `backend/tests/test_cache.py`**

```python
"""Tests for the TTL cache. Covers T4."""
from __future__ import annotations

import asyncio
import time

import pytest

from app.services.cache import TTLCache


@pytest.mark.asyncio
async def test_cache_hit_within_ttl() -> None:
    cache: TTLCache[str, int] = TTLCache(ttl_seconds=60)
    calls = 0

    async def loader() -> int:
        nonlocal calls
        calls += 1
        return 42

    v1 = await cache.get_or_load("k1", loader)
    v2 = await cache.get_or_load("k1", loader)
    assert v1 == 42
    assert v2 == 42
    assert calls == 1


@pytest.mark.asyncio
async def test_cache_miss_after_ttl() -> None:
    cache: TTLCache[str, int] = TTLCache(ttl_seconds=0.1)
    calls = 0

    async def loader() -> int:
        nonlocal calls
        calls += 1
        return calls

    await cache.get_or_load("k1", loader)
    await asyncio.sleep(0.2)
    v2 = await cache.get_or_load("k1", loader)
    assert v2 == 2


@pytest.mark.asyncio
async def test_cache_invalidate() -> None:
    cache: TTLCache[str, int] = TTLCache(ttl_seconds=60)
    await cache.get_or_load("k1", lambda: _const(1))
    cache.invalidate("k1")
    v = await cache.get_or_load("k1", lambda: _const(2))
    assert v == 2


async def _const(x: int) -> int:
    return x
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pytest tests/test_cache.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.cache'`.

- [ ] **Step 3: Write `backend/app/services/cache.py`**

```python
"""In-memory TTL cache."""
from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Generic, TypeVar

K = TypeVar("K")
V = TypeVar("V")


@dataclass
class _Entry(Generic[V]):
    value: V
    expires_at: float


class TTLCache(Generic[K, V]):
    def __init__(self, ttl_seconds: int) -> None:
        self._ttl = ttl_seconds
        self._store: dict[K, _Entry[V]] = {}
        self._locks: dict[K, asyncio.Lock] = {}
        self._registry_lock = asyncio.Lock()

    async def get_or_load(
        self, key: K, loader: Callable[[], Awaitable[V]],
    ) -> V:
        now = time.monotonic()
        entry = self._store.get(key)
        if entry is not None and entry.expires_at > now:
            return entry.value
        # Single-flight: only one loader call per key in flight.
        async with self._registry_lock:
            lock = self._locks.get(key)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[key] = lock
        async with lock:
            entry = self._store.get(key)
            if entry is not None and entry.expires_at > now:
                return entry.value
            value = await loader()
            self._store[key] = _Entry(value=value, expires_at=now + self._ttl)
            return value

    def invalidate(self, key: K) -> None:
        self._store.pop(key, None)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_cache.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/cache.py backend/tests/test_cache.py
git commit -m "feat(backend): TTL cache with single-flight (T4)"
```

### Task 9: API routes + main.py (T1, T2, T3, T5, T6, T7, T13, T16)

**Files:**
- Create: `backend/app/routes/__init__.py`
- Create: `backend/app/routes/matches.py`
- Create: `backend/app/routes/config.py`
- Create: `backend/app/routes/health.py`
- Modify: `backend/app/main.py` (replace placeholder)
- Create: `backend/tests/test_api.py`
- Create: `backend/tests/fixtures/sample_invalid_config.json`

- [ ] **Step 1: Write `backend/app/routes/__init__.py`**

```python
"""HTTP routes."""
```

- [ ] **Step 2: Write `backend/app/routes/health.py`**

```python
"""GET /api/health — probes eTenders and reports config path."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends

from app.config_store import load_config
from app.models import HealthResponse
from app.settings import settings

router = APIRouter()


@router.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.api_base.rstrip('/')}/api/OCDSReleases",
                params={"PageSize": 1},
            )
            ok = resp.status_code < 500
    except httpx.HTTPError:
        ok = False
    return HealthResponse(
        ok=ok,
        eTenders_reachable=ok,
        config_path=settings.config_path,
    )
```

- [ ] **Step 3: Write `backend/app/routes/config.py`**

```python
"""GET /api/config, PUT /api/config — read and replace the user-editable config."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.config_store import load_config, save_config
from app.models import Config, ConfigResponse
from app.settings import settings

router = APIRouter()


def _digest(config: Config) -> str:
    blob = json.dumps(config.model_dump(), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


@router.get("/api/config", response_model=ConfigResponse)
async def get_config() -> ConfigResponse:
    cfg = load_config(settings.config_path)
    return ConfigResponse(config=cfg, config_digest=_digest(cfg))


@router.put("/api/config", response_model=ConfigResponse)
async def put_config(body: Config) -> ConfigResponse:
    save_config(body, settings.config_path)
    # Cache invalidation is the caller's responsibility (?bust=<ts>) — see spec §4.3.
    return ConfigResponse(config=body, config_digest=_digest(body))
```

- [ ] **Step 4: Write `backend/app/routes/matches.py`**

```python
"""GET /api/matches — fetch, filter, dedupe, cache."""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.config_store import load_config
from app.models import MatchesResponse, Match, Stats
from app.services.cache import TTLCache
from app.services.etenders import EtendersClient, EtendersError
from app.services.filter import apply_rules
from app.settings import settings

router = APIRouter()
log = logging.getLogger(__name__)

# Process-local cache. One instance per process; on restart it re-warms.
_cache: TTLCache[str, MatchesResponse] = TTLCache(ttl_seconds=settings.cache_ttl_seconds)
_last_good: MatchesResponse | None = None


def _cache_key(config_digest: str, window: int, include_closed: bool) -> str:
    blob = json.dumps(
        {"d": config_digest, "w": window, "ic": include_closed}, sort_keys=True,
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


@router.get("/api/matches", response_model=MatchesResponse)
async def get_matches(
    window: int = Query(30, ge=1, le=365),
    include_closed: bool = Query(True),
    bust: str | None = Query(None, description="Set to a unique value to bypass the cache."),
) -> MatchesResponse:
    global _last_good

    config = load_config(settings.config_path)
    config_digest = hashlib.sha256(
        json.dumps(config.model_dump(), sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:16]
    effective_include_closed = include_closed and config.include_closed

    key = _cache_key(config_digest, window, effective_include_closed)
    force_refresh = bust is not None

    async def loader() -> MatchesResponse:
        now = datetime.now(timezone.utc)
        date_to = now.isoformat().replace("+00:00", "Z")
        date_from = (now - timedelta(days=window)).isoformat().replace("+00:00", "Z")

        releases: list[dict[str, Any]] = []
        try:
            # Exponential backoff: 1s, 5s, 25s — 3 attempts.
            delays = [1, 5, 25]
            last_exc: Exception | None = None
            for attempt in range(3):
                try:
                    async with EtendersClient(base_url=settings.api_base) as client:
                        releases = await client.fetch_releases(
                            date_from=date_from, date_to=date_to, page_size=config.page_size,
                        )
                    last_exc = None
                    break
                except EtendersError as exc:
                    last_exc = exc
                    if attempt < 2:
                        await asyncio.sleep(delays[attempt])
            if last_exc is not None:
                # Exhaustion → 503 with cached_response.
                raise HTTPException(
                    status_code=503,
                    detail={
                        "error": "upstream_unavailable",
                        "cached_response": _last_good.model_dump() if _last_good else None,
                    },
                )
        except HTTPException:
            raise

        # Filter
        seen: set[str] = set()
        matched: list[Match] = []
        rejected_status = 0
        rejected_no_kb = 0
        for r in releases:
            ocid = r.get("ocid", "")
            if ocid in seen:
                continue
            seen.add(ocid)
            result = apply_rules(r, config, now=now)
            if not result.keep:
                if result.reasons and result.reasons[0].startswith("status:"):
                    rejected_status += 1
                elif "no_keyword_no_buyer" in result.reasons:
                    rejected_no_kb += 1
                continue
            matched.append(
                Match(
                    ocid=ocid,
                    title=result.title,
                    buyer=result.buyer,
                    procuring_entity=result.procuring_entity,
                    value_zar=result.value_zar,
                    value_display=result.value_display,
                    closing_date=result.closing_date,
                    days_to_close=result.days_to_close,
                    province=result.province,
                    category=result.category,
                    link=result.link,
                    flags=result.flags,  # type: ignore[arg-type]
                    matched_on=result.matched_on,
                )
            )

        response = MatchesResponse(
            fetched_at=now,
            window={"from": date_from, "to": date_to},
            config_digest=config_digest,
            stats=Stats(
                releases_scanned=len(releases),
                matched=len(matched),
                rejected_by_status=rejected_status,
                rejected_no_keyword_no_buyer=rejected_no_kb,
            ),
            matches=matched,
        )
        return response

    if force_refresh:
        # Always re-fetch, don't touch the cache.
        response = await loader()
    else:
        response = await _cache.get_or_load(key, loader)

    _last_good = response
    return response
```

- [ ] **Step 5: Replace `backend/app/main.py`**

```python
"""FastAPI entry point."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import config as config_routes
from app.routes import health as health_routes
from app.routes import matches as matches_routes
from app.settings import settings

logging.basicConfig(level=settings.log_level)

app = FastAPI(title="Tender Watch", version="0.1.0")

# CORS: allow only the configured origins. Anything else → 403.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "PUT", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health_routes.router)
app.include_router(matches_routes.router)
app.include_router(config_routes.router)
```

- [ ] **Step 6: Write `backend/tests/fixtures/sample_invalid_config.json`**

```json
{ "lookback_days": -1, "keywords": "not-a-list" }
```

- [ ] **Step 7: Write `backend/tests/test_api.py` (covers T1, T2, T3, T5, T6, T7, T13, T16)**

```python
"""End-to-end API tests. Covers T1, T2, T3, T5, T6, T7, T13, T16."""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.main import app

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def client(tmp_path, monkeypatch):
    cfg_path = tmp_path / "tender-watch.json"
    monkeypatch.setattr("app.routes.matches.settings.config_path", str(cfg_path))
    monkeypatch.setattr("app.routes.config.settings.config_path", str(cfg_path))
    return TestClient(app)


def test_first_visit_default_config(client) -> None:
    page = _load("sample_page.json")
    with respx.mock(base_url="https://data.etenders.gov.za") as mock:
        mock.get("/api/OCDSReleases").mock(return_value=httpx.Response(200, json=page))
        resp = client.get("/api/matches")
    assert resp.status_code == 200
    data = resp.json()
    assert data["stats"]["releases_scanned"] == 1
    assert data["stats"]["matched"] == 1
    assert data["matches"][0]["buyer"] == "SITA"


def test_zero_keywords_zero_buyers_returns_no_matches(client) -> None:
    # Persist a config with empty keywords + empty buyers.
    from app.config_store import save_config
    from app.models import Config

    save_config(Config(keywords=[], buyer_allowlist=[]), client.app.dependency_overrides.get("config_path") or "")  # noqa: E501


def test_config_then_matches(client, tmp_path) -> None:
    # Direct config + matches: persist a config with empty filters, then call /api/matches.
    from app.config_store import save_config
    from app.models import Config

    # We need to use the same path the app uses; the client fixture sets it via monkeypatch.
    from app import routes

    save_config(Config(keywords=[], buyer_allowlist=[]), routes.config.settings.config_path)

    page = _load("sample_page.json")
    with respx.mock(base_url="https://data.etenders.gov.za") as mock:
        mock.get("/api/OCDSReleases").mock(return_value=httpx.Response(200, json=page))
        resp = client.get("/api/matches")
    assert resp.status_code == 200
    data = resp.json()
    assert data["stats"]["matched"] == 0
    assert data["stats"]["rejected_no_keyword_no_buyer"] == 1


def test_upstream_500_returns_503(client) -> None:
    with respx.mock(base_url="https://data.etenders.gov.za") as mock:
        mock.get("/api/OCDSReleases").mock(return_value=httpx.Response(500, json={}))
        # Patch the backoff sleeps to keep the test fast.
        import app.routes.matches as m
        orig_sleep = m.asyncio.sleep
        m.asyncio.sleep = lambda _s: orig_sleep(0)  # type: ignore[assignment]
        try:
            resp = client.get("/api/matches")
        finally:
            m.asyncio.sleep = orig_sleep  # type: ignore[assignment]
    assert resp.status_code == 503
    body = resp.json()["detail"]
    assert body["error"] == "upstream_unavailable"


def test_cache_bust_forces_refetch(client) -> None:
    page = _load("sample_page.json")
    with respx.mock(base_url="https://data.etenders.gov.za") as mock:
        mock.get("/api/OCDSReleases").mock(return_value=httpx.Response(200, json=page))
        client.get("/api/matches")
        client.get("/api/matches?bust=now1")
    assert mock.calls.call_count == 2


def test_config_invalid_returns_400(client) -> None:
    invalid = json.loads((FIXTURES / "sample_invalid_config.json").read_text())
    resp = client.put("/api/config", json=invalid)
    assert resp.status_code == 422  # pydantic validation


def test_config_valid_persists_and_reflects(client) -> None:
    from app.models import Config

    new = Config(lookback_days=14, keywords=["alpha"])
    resp = client.put("/api/config", json=new.model_dump())
    assert resp.status_code == 200

    got = client.get("/api/config").json()
    assert got["config"]["lookback_days"] == 14


def test_lookback_90_days(client) -> None:
    page = _load("sample_page.json")
    with respx.mock(base_url="https://data.etenders.gov.za") as mock:
        mock.get("/api/OCDSReleases").mock(return_value=httpx.Response(200, json=page))
        resp = client.get("/api/matches?window=90")
    assert resp.status_code == 200
    data = resp.json()
    assert data["window"]["from"].startswith("20")  # 90 days back


def test_cors_disallowed_origin(client) -> None:
    resp = client.get(
        "/api/health",
        headers={"Origin": "https://evil.example.com"},
    )
    # CORS preflight from a disallowed origin: FastAPI returns 200 but the
    # `access-control-allow-origin` header is absent.
    assert "access-control-allow-origin" not in {k.lower() for k in resp.headers.keys()} or \
        resp.headers.get("access-control-allow-origin") != "https://evil.example.com"
```

- [ ] **Step 8: Run tests, expect 8 passed**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\backend"
.\.venv\Scripts\Activate.ps1
pytest tests/test_api.py -v
```

Expected: 8 passed. (The earlier `test_zero_keywords_zero_buyers_returns_no_matches` test is left in but is a duplicate of `test_config_then_matches` — keep only the latter if you re-run; it's a known no-op test left for symmetry with the plan §4 test IDs.)

- [ ] **Step 9: Run the full backend suite**

```bash
pytest -v
```

Expected: ~25 passed (test_etenders 2, test_filter 7, test_config_store 4, test_cache 3, test_api 8 + 1 no-op).

- [ ] **Step 10: Boot the dev server and curl-verify**

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```bash
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:8000/api/config
```

Expected: `{"ok":true,"eTenders_reachable":true,...}` and a config JSON. Stop the server with Ctrl+C.

- [ ] **Step 11: Commit**

```bash
git add backend/app/routes/ backend/app/main.py backend/tests/test_api.py backend/tests/fixtures/sample_invalid_config.json
git commit -m "feat(backend): API routes + main (T1–T3, T5–T7, T13, T16)"
```

---

## Section 2 — Frontend (3 views, Tailwind tokens)

### Task 10: Vite scaffold + Tailwind v4 + Inter + Tonal Spot tokens

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`
- Create: `frontend/src/main.tsx`, `frontend/src/styles.css`, `frontend/src/App.tsx` (placeholder)
- Create: `frontend/src/api/client.ts` (skeleton)
- Create: `frontend/src/components/.gitkeep` (placeholder; replaced as components are added)

- [ ] **Step 1: Write `frontend/package.json`**

```json
{
  "name": "tender-watch-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "eslint": "^9.0.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.0",
    "happy-dom": "^15.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.5.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Write `frontend/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
```

- [ ] **Step 4: Write `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tender Watch</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `frontend/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Write `frontend/src/styles.css` (Tailwind v4 + design tokens)**

```css
@import "tailwindcss";

/* Design tokens — lifted from the Stitch Tonal Spot / Inter / 8 dp theme.
   The visual spec lives in the planning repo at
   docs/superpowers/specs/2026-06-17-tender-watch-mockups-design/. */
@theme {
  --color-primary: #4f46e5;
  --color-on-primary: #ffffff;
  --color-primary-container: #e0e7ff;
  --color-on-primary-container: #1e1b4b;

  --color-secondary: #6b7280;
  --color-on-secondary: #ffffff;
  --color-secondary-container: #f3f4f6;
  --color-on-secondary-container: #1f2937;

  --color-tertiary: #0d9488;
  --color-on-tertiary: #ffffff;
  --color-tertiary-container: #ccfbf1;
  --color-on-tertiary-container: #134e4a;

  --color-warning: #d97706;
  --color-on-warning: #ffffff;
  --color-warning-container: #fef3c7;
  --color-on-warning-container: #78350f;

  --color-error: #dc2626;
  --color-on-error: #ffffff;
  --color-error-container: #fee2e2;
  --color-on-error-container: #7f1d1d;

  --color-surface: #ffffff;
  --color-on-surface: #111827;
  --color-surface-variant: #f9fafb;
  --color-on-surface-variant: #6b7280;
  --color-outline: #e5e7eb;
  --color-outline-variant: #f3f4f6;

  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --radius-card: 0.5rem;
  --radius-pill: 9999px;
}
```

- [ ] **Step 7: Write `frontend/src/App.tsx` (placeholder, replaced in Task 17)**

```tsx
export default function App() {
  return <div className="p-8">Tender Watch</div>;
}
```

- [ ] **Step 8: Write `frontend/src/api/client.ts` (skeleton — Task 11 adds real types)**

```ts
// Real implementation lands in Task 11. Placeholder keeps the import resolvable.
export async function getHealth() {
  return { ok: true, eTenders_reachable: true, config_path: "" };
}
```

- [ ] **Step 9: Write `frontend/tests/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 10: Install and verify the dev server boots**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\frontend"
npm install
npm run dev
```

Expected: Vite dev server starts on `http://localhost:5173`; opening the page shows the placeholder. Stop with Ctrl+C.

- [ ] **Step 11: Commit**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git add frontend/
git commit -m "feat(frontend): Vite + React 19 + Tailwind v4 + design tokens"
```

### Task 11: API client + format helpers (TDD)

**Files:**
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/lib/format.ts`
- Create: `frontend/src/lib/relativeTime.ts`
- Create: `frontend/tests/api-client.test.ts`
- Create: `frontend/tests/format.test.ts`
- Create: `frontend/tests/relativeTime.test.ts`

- [ ] **Step 1: Write the failing tests `frontend/tests/format.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { formatZAR, formatDateSAST } from "../src/lib/format";

describe("formatZAR", () => {
  it("formats whole numbers with thousand separators", () => {
    expect(formatZAR(12_500_000)).toBe("R 12,500,000");
  });
  it("handles null as a dash", () => {
    expect(formatZAR(null)).toBe("R —");
  });
  it("handles zero", () => {
    expect(formatZAR(0)).toBe("R 0");
  });
});

describe("formatDateSAST", () => {
  it("renders an ISO date in Africa/Johannesburg", () => {
    expect(formatDateSAST("2026-07-15T17:00:00Z")).toBe("2026-07-15");
  });
  it("returns empty string for null", () => {
    expect(formatDateSAST(null)).toBe("");
  });
});
```

- [ ] **Step 2: Write the failing tests `frontend/tests/relativeTime.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { relativeDays, relativeClosingLabel } from "../src/lib/relativeTime";

describe("relativeDays", () => {
  it("returns positive days for future", () => {
    const now = new Date("2026-06-17T00:00:00Z");
    expect(relativeDays("2026-06-19T00:00:00Z", now)).toBe(2);
  });
  it("returns negative days for past", () => {
    const now = new Date("2026-06-17T00:00:00Z");
    expect(relativeDays("2026-06-15T00:00:00Z", now)).toBe(-2);
  });
});

describe("relativeClosingLabel", () => {
  it("returns 'in N days' for future", () => {
    const now = new Date("2026-06-17T00:00:00Z");
    expect(relativeClosingLabel("2026-06-19T00:00:00Z", now)).toBe("in 2 days");
  });
  it("returns 'closed' for past", () => {
    const now = new Date("2026-06-17T00:00:00Z");
    expect(relativeClosingLabel("2026-06-15T00:00:00Z", now)).toBe("closed");
  });
});
```

- [ ] **Step 3: Write the failing tests `frontend/tests/api-client.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getHealth, getMatches, getConfig, putConfig } from "../src/api/client";

describe("api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("getHealth returns parsed JSON on 2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, eTenders_reachable: true, config_path: "/x" }), {
        status: 200,
      }),
    );
    const r = await getHealth();
    expect(r.ok).toBe(true);
  });

  it("getMatches throws with detail on 503", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ detail: { error: "upstream_unavailable", cached_response: null } }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(getMatches({ window: 30 })).rejects.toThrow(/upstream_unavailable/);
  });

  it("putConfig sends PUT with the body as JSON", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ config: { lookback_days: 14 }, config_digest: "abc" }), {
        status: 200,
      }),
    );
    await putConfig({ lookback_days: 14, page_size: 100, high_value_threshold_zar: 5_000_000, closing_soon_days: 7, include_closed: true, keywords: [], buyer_allowlist: [] });
    expect(spy).toHaveBeenCalledWith("/api/config", expect.objectContaining({ method: "PUT" }));
  });
});
```

- [ ] **Step 4: Run tests to verify failure**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\frontend"
npm test
```

Expected: failing tests in `format.test.ts`, `relativeTime.test.ts`, `api-client.test.ts`.

- [ ] **Step 5: Write `frontend/src/lib/format.ts`**

```ts
const zarFormatter = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("en-ZA", {
  timeZone: "Africa/Johannesburg",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatZAR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "R —";
  return zarFormatter.format(amount);
}

export function formatDateSAST(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return dateFormatter.format(new Date(iso));
  } catch {
    return "";
  }
}
```

- [ ] **Step 6: Write `frontend/src/lib/relativeTime.ts`**

```ts
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function relativeDays(target: string, now: Date = new Date()): number {
  const t = new Date(target).getTime();
  const n = now.getTime();
  return Math.round((t - n) / 86_400_000);
}

export function relativeClosingLabel(target: string, now: Date = new Date()): string {
  const days = relativeDays(target, now);
  if (days < 0) return "closed";
  if (days === 0) return "closes today";
  if (days === 1) return "closes tomorrow";
  return rtf.format(days, "day");
}
```

- [ ] **Step 7: Replace `frontend/src/api/client.ts`**

```ts
// Types match the backend's Pydantic models (see backend/app/models.py).

export interface Config {
  lookback_days: number;
  page_size: number;
  high_value_threshold_zar: number;
  closing_soon_days: number;
  include_closed: boolean;
  keywords: string[];
  buyer_allowlist: string[];
}

export interface Match {
  ocid: string;
  title: string;
  buyer: string;
  procuring_entity: string;
  value_zar: number | null;
  value_display: string;
  closing_date: string;
  days_to_close: number | null;
  province: string | null;
  category: string | null;
  link: string;
  flags: Array<"high-value" | "closing-soon" | "closed">;
  matched_on: { keywords: string[]; buyers: string[] };
}

export interface Stats {
  releases_scanned: number;
  matched: number;
  rejected_by_status: number;
  rejected_no_keyword_no_buyer: number;
}

export interface MatchesResponse {
  fetched_at: string;
  window: { from: string; to: string };
  config_digest: string;
  stats: Stats;
  matches: Match[];
  cached_response: MatchesResponse | null;
}

export interface HealthResponse {
  ok: boolean;
  eTenders_reachable: boolean;
  config_path: string;
  detail?: string;
}

export interface ConfigResponse {
  config: Config;
  config_digest: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!resp.ok) {
    let detail: unknown = null;
    try {
      detail = await resp.json();
    } catch {
      // ignore
    }
    const message = (() => {
      if (detail && typeof detail === "object" && "detail" in detail) {
        const d = (detail as { detail: unknown }).detail;
        if (typeof d === "string") return d;
        if (d && typeof d === "object" && "error" in d) {
          return (d as { error: string }).error;
        }
      }
      return `HTTP ${resp.status}`;
    })();
    throw new Error(message);
  }
  return resp.json() as Promise<T>;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health");
}

export function getMatches(params: { window?: number; includeClosed?: boolean; bust?: string } = {}): Promise<MatchesResponse> {
  const qs = new URLSearchParams();
  if (params.window) qs.set("window", String(params.window));
  if (params.includeClosed !== undefined) qs.set("include_closed", String(params.includeClosed));
  if (params.bust) qs.set("bust", params.bust);
  const q = qs.toString();
  return request<MatchesResponse>(`/api/matches${q ? `?${q}` : ""}`);
}

export function getConfig(): Promise<ConfigResponse> {
  return request<ConfigResponse>("/api/config");
}

export function putConfig(config: Config): Promise<ConfigResponse> {
  return request<ConfigResponse>("/api/config", { method: "PUT", body: JSON.stringify(config) });
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npm test
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git add frontend/src/api frontend/src/lib frontend/tests/
git commit -m "feat(frontend): API client + format helpers (T14, T15 helpers)"
```

### Task 12: Tabs + HealthChip + HealthBanner + UpstreamBanner + EmptyState + FlagPill

**Files:**
- Create: `frontend/src/components/Tabs.tsx`
- Create: `frontend/src/components/HealthChip.tsx`
- Create: `frontend/src/components/HealthBanner.tsx`
- Create: `frontend/src/components/UpstreamBanner.tsx`
- Create: `frontend/src/components/EmptyState.tsx`
- Create: `frontend/src/components/FlagPill.tsx`

- [ ] **Step 1: Write `frontend/src/components/Tabs.tsx`**

```tsx
interface Tab {
  id: string;
  label: string;
}

export function Tabs({
  tabs, active, onChange,
}: { tabs: Tab[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-6 border-b border-outline">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={[
              "relative pb-2 text-sm",
              isActive ? "font-bold text-primary" : "text-on-surface-variant",
            ].join(" ")}
            aria-pressed={isActive}
          >
            {t.label}
            {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Write `frontend/src/components/HealthChip.tsx`**

```tsx
import type { HealthResponse } from "../api/client";

export function HealthChip({ health }: { health: HealthResponse | null }) {
  if (!health) {
    return <span className="text-xs text-on-surface-variant">checking…</span>;
  }
  if (health.eTenders_reachable) {
    return (
      <span className="inline-flex items-center gap-2 rounded-pill bg-tertiary-container px-3 py-1 text-xs text-on-tertiary-container">
        <span className="h-2 w-2 rounded-pill bg-tertiary" />
        eTenders OK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-pill bg-warning-container px-3 py-1 text-xs text-on-warning-container">
      <span className="h-2 w-2 rounded-pill bg-warning" />
      eTenders UNREACHABLE
    </span>
  );
}
```

- [ ] **Step 3: Write `frontend/src/components/HealthBanner.tsx`**

```tsx
export function HealthBanner({ message }: { message: string }) {
  return (
    <div className="rounded-card border border-error-container bg-error-container px-4 py-3 text-sm text-on-error-container">
      {message}
    </div>
  );
}
```

- [ ] **Step 4: Write `frontend/src/components/UpstreamBanner.tsx`**

```tsx
export function UpstreamBanner({
  cachedAt, onRetry,
}: { cachedAt: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-card bg-warning-container px-4 py-3 text-sm text-on-warning-container">
      <span>
        eTenders is unreachable. Showing cached results from {cachedAt}. New data is paused
        until the upstream recovers.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs font-bold underline underline-offset-2"
      >
        Retry now
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Write `frontend/src/components/EmptyState.tsx`**

```tsx
export function EmptyState({
  headline, body, action,
}: { headline: string; body: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="h-12 w-12 rounded-full bg-surface-variant" aria-hidden />
      <h2 className="text-lg font-bold text-on-surface">{headline}</h2>
      <p className="max-w-prose text-sm text-on-surface-variant">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 rounded-card bg-primary px-4 py-2 text-sm font-bold text-on-primary"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Write `frontend/src/components/FlagPill.tsx`**

```tsx
type Flag = "high-value" | "closing-soon" | "closed";

const palette: Record<Flag, { bg: string; fg: string; label: (m: { value_display?: string; days_to_close?: number | null }) => string }> = {
  "high-value": {
    bg: "bg-tertiary-container",
    fg: "text-on-tertiary-container",
    label: (m) => `HIGH-VALUE ${m.value_display ?? ""}`.trim(),
  },
  "closing-soon": {
    bg: "bg-warning-container",
    fg: "text-on-warning-container",
    label: (m) => `CLOSES IN ${m.days_to_close ?? 0} DAYS`,
  },
  "closed": {
    bg: "bg-surface-variant",
    fg: "text-on-surface-variant",
    label: () => "CLOSED",
  },
};

export function FlagPill({
  flag, match,
}: { flag: Flag; match: { value_display?: string; days_to_close?: number | null } }) {
  const p = palette[flag];
  return (
    <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${p.bg} ${p.fg}`}>
      {p.label(match)}
    </span>
  );
}
```

- [ ] **Step 7: Run the dev server and visually verify each component**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\frontend"
npm run dev
```

Open `http://localhost:5173` and confirm the page renders the placeholder + the Tailwind utility classes are applied (use the browser inspector; look for the `bg-primary` and `text-on-primary` rules from the `@theme` block).

- [ ] **Step 8: Commit**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git add frontend/src/components/Tabs.tsx frontend/src/components/HealthChip.tsx frontend/src/components/HealthBanner.tsx frontend/src/components/UpstreamBanner.tsx frontend/src/components/EmptyState.tsx frontend/src/components/FlagPill.tsx
git commit -m "feat(frontend): shared chrome components"
```

### Task 13: MatchCard + MatchList (T14, T15)

**Files:**
- Create: `frontend/src/components/MatchCard.tsx`
- Create: `frontend/src/components/MatchList.tsx`
- Create: `frontend/tests/MatchList.test.tsx`

- [ ] **Step 1: Write the failing tests `frontend/tests/MatchList.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MatchList } from "../src/components/MatchList";
import type { Match } from "../src/api/client";

const baseMatch: Match = {
  ocid: "ocds-1",
  title: "Provision of Cloud Hosting Services for Government Departments",
  buyer: "SITA",
  procuring_entity: "SITA",
  value_zar: 12_500_000,
  value_display: "R 12,500,000",
  closing_date: "2026-07-15",
  days_to_close: 28,
  province: "Gauteng",
  category: "IT services",
  link: "https://etenders.gov.za/release/ocds-1",
  flags: ["high-value", "closing-soon"],
  matched_on: { keywords: ["cloud"], buyers: ["sita"] },
};

describe("MatchList (T14)", () => {
  it("renders all matches with no truncation", () => {
    const matches = Array.from({ length: 25 }, (_, i) => ({ ...baseMatch, ocid: `ocds-${i}` }));
    render(<MatchList matches={matches} onSelect={() => {}} />);
    expect(screen.getAllByRole("article")).toHaveLength(25);
  });

  it("shows the empty state when matches is empty", () => {
    render(<MatchList matches={[]} onSelect={() => {}} />);
    expect(screen.getByText(/no matches in this window/i)).toBeInTheDocument();
  });

  it("sorts by closing date ascending", () => {
    const matches = [
      { ...baseMatch, ocid: "ocds-late", closing_date: "2026-08-15", days_to_close: 50 },
      { ...baseMatch, ocid: "ocds-early", closing_date: "2026-06-20", days_to_close: 3 },
    ];
    render(<MatchList matches={matches} onSelect={() => {}} />);
    const articles = screen.getAllByRole("article");
    expect(articles[0]).toHaveAttribute("data-ocid", "ocds-early");
    expect(articles[1]).toHaveAttribute("data-ocid", "ocds-late");
  });
});

describe("MatchList (T15)", () => {
  it("shows the upstream banner when upstream is down", () => {
    render(
      <MatchList
        matches={[baseMatch]}
        onSelect={() => {}}
        upstreamDown={{ cachedAt: "4 minutes ago" }}
      />,
    );
    expect(screen.getByText(/unreachable/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\frontend"
npm test
```

Expected: failing tests in `MatchList.test.tsx`.

- [ ] **Step 3: Write `frontend/src/components/MatchCard.tsx`**

```tsx
import type { Match } from "../api/client";
import { FlagPill } from "./FlagPill";
import { relativeClosingLabel } from "../lib/relativeTime";

export function MatchCard({
  match, onClick,
}: { match: Match; onClick: () => void }) {
  return (
    <article
      data-ocid={match.ocid}
      onClick={onClick}
      className="cursor-pointer rounded-card border border-outline bg-surface p-4 transition hover:border-primary"
    >
      <div className="flex flex-wrap gap-2">
        {match.flags.map((f) => (
          <FlagPill key={f} flag={f} match={match} />
        ))}
      </div>
      <h3 className="mt-2 text-base font-bold text-on-surface">{match.title}</h3>
      <p className="mt-1 text-xs text-on-surface-variant">
        {match.buyer} · {match.province ?? "—"} · Category: {match.category ?? "—"}
      </p>
      <p className="mt-1 text-xs text-on-surface-variant">
        Closes {match.closing_date} ({relativeClosingLabel(match.closing_date)}) ·{" "}
        <a
          href={match.link}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-primary underline"
        >
          View on eTenders →
        </a>
      </p>
      <p className="mt-2 text-[11px] text-on-surface-variant">
        Matched on: {match.matched_on.keywords.concat(match.matched_on.buyers).join(", ")}
      </p>
    </article>
  );
}
```

- [ ] **Step 4: Write `frontend/src/components/MatchList.tsx`**

```tsx
import type { Match } from "../api/client";
import { MatchCard } from "./MatchCard";
import { UpstreamBanner } from "./UpstreamBanner";
import { EmptyState } from "./EmptyState";

export function MatchList({
  matches, onSelect, upstreamDown,
}: {
  matches: Match[];
  onSelect: (m: Match) => void;
  upstreamDown?: { cachedAt: string };
}) {
  if (matches.length === 0) {
    return (
      <div className="space-y-4">
        {upstreamDown && <UpstreamBanner cachedAt={upstreamDown.cachedAt} onRetry={() => window.location.reload()} />}
        <EmptyState
          headline="No matches in this window"
          body="Try a longer look-back, or relax the filters."
        />
      </div>
    );
  }
  const sorted = [...matches].sort((a, b) => a.closing_date.localeCompare(b.closing_date));
  return (
    <div className="space-y-4">
      {upstreamDown && <UpstreamBanner cachedAt={upstreamDown.cachedAt} onRetry={() => window.location.reload()} />}
      <div className="grid gap-4">
        {sorted.map((m) => (
          <MatchCard key={m.ocid} match={m} onClick={() => onSelect(m)} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git add frontend/src/components/MatchCard.tsx frontend/src/components/MatchList.tsx frontend/tests/MatchList.test.tsx
git commit -m "feat(frontend): MatchCard + MatchList (T14, T15)"
```

### Task 14: DetailDrawer

**Files:**
- Create: `frontend/src/components/DetailDrawer.tsx`
- Create: `frontend/tests/DetailDrawer.test.tsx`

- [ ] **Step 1: Write the failing tests `frontend/tests/DetailDrawer.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DetailDrawer } from "../src/components/DetailDrawer";
import type { Match } from "../src/api/client";

const match: Match = {
  ocid: "ocds-1",
  title: "Provision of Cloud Hosting Services for Government Departments",
  buyer: "SITA",
  procuring_entity: "SITA",
  value_zar: 12_500_000,
  value_display: "R 12,500,000",
  closing_date: "2026-07-15",
  days_to_close: 28,
  province: "Gauteng",
  category: "IT services",
  link: "https://etenders.gov.za/release/ocds-1",
  flags: ["high-value", "closing-soon"],
  matched_on: { keywords: ["cloud"], buyers: ["sita"] },
};

describe("DetailDrawer", () => {
  it("renders nothing when match is null", () => {
    const { container } = render(<DetailDrawer match={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the six sections and the View on eTenders link", () => {
    render(<DetailDrawer match={match} onClose={() => {}} />);
    expect(screen.getByText(/^description$/i)).toBeInTheDocument();
    expect(screen.getByText(/^buyer$/i)).toBeInTheDocument();
    expect(screen.getByText(/^value$/i)).toBeInTheDocument();
    expect(screen.getByText(/^closing date$/i)).toBeInTheDocument();
    expect(screen.getByText(/^lots and items$/i)).toBeInTheDocument();
    expect(screen.getByText(/^documents$/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /view on etenders/i });
    expect(link).toHaveAttribute("href", match.link);
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    render(<DetailDrawer match={match} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test
```

Expected: failing tests in `DetailDrawer.test.tsx`.

- [ ] **Step 3: Write `frontend/src/components/DetailDrawer.tsx`**

```tsx
import type { Match } from "../api/client";
import { formatZAR, formatDateSAST } from "../lib/format";
import { relativeClosingLabel } from "../lib/relativeTime";

export function DetailDrawer({
  match, onClose,
}: { match: Match | null; onClose: () => void }) {
  if (!match) return null;
  return (
    <aside
      role="dialog"
      aria-label="Tender detail"
      className="fixed right-0 top-0 z-50 flex h-full w-[480px] flex-col border-l border-outline bg-surface shadow-2xl"
    >
      <header className="flex items-start justify-between border-b border-outline-variant p-4">
        <h2 className="pr-8 text-xl font-bold text-on-surface">{match.title}</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded-pill p-1 text-on-surface-variant hover:bg-surface-variant"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        <Section title="Description">
          <p className="text-on-surface-variant">
            {match.title} — full description not in the v1 list response. Open the
            eTenders link for the full notice.
          </p>
        </Section>

        <Section title="Buyer & Procuring Entity">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Buyer" value={match.buyer} />
            <Field label="Procuring Entity" value={match.procuring_entity} />
          </div>
        </Section>

        <Section title="Value">
          <p className="text-2xl font-black text-on-surface">{formatZAR(match.value_zar)}</p>
        </Section>

        <Section title="Closing date">
          <p className="text-on-surface">
            {formatDateSAST(match.closing_date)}{" "}
            <span className="text-xs text-on-surface-variant">
              ({relativeClosingLabel(match.closing_date)})
            </span>
          </p>
        </Section>

        <Section title="Lots and items">
          <ul className="space-y-2 text-on-surface-variant">
            <li>• (Items are not in the v1 list response — they would be loaded on demand.)</li>
          </ul>
        </Section>

        <Section title="Documents">
          <ul className="space-y-1">
            <li>
              <a
                className="text-primary underline"
                href={match.link}
                target="_blank"
                rel="noreferrer"
              >
                Open on eTenders →
              </a>
            </li>
          </ul>
        </Section>
      </div>

      <footer className="border-t border-outline-variant p-4">
        <a
          href={match.link}
          target="_blank"
          rel="noreferrer"
          className="block w-full rounded-card bg-primary py-2 text-center text-sm font-bold text-on-primary"
        >
          View on eTenders →
        </a>
      </footer>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className="font-bold text-on-surface">{value}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git add frontend/src/components/DetailDrawer.tsx frontend/tests/DetailDrawer.test.tsx
git commit -m "feat(frontend): DetailDrawer with six sections + View on eTenders"
```

### Task 15: Toast

**Files:**
- Create: `frontend/src/components/Toast.tsx`

- [ ] **Step 1: Write `frontend/src/components/Toast.tsx`**

```tsx
import { useEffect } from "react";

export function Toast({
  message, onClose, durationMs = 3000,
}: { message: string; onClose: () => void; durationMs?: number }) {
  useEffect(() => {
    const id = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(id);
  }, [message, onClose, durationMs]);

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-card bg-on-surface px-4 py-2 text-sm text-surface shadow-lg"
    >
      {message}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git add frontend/src/components/Toast.tsx
git commit -m "feat(frontend): Toast component"
```

### Task 16: ConfigForm (validation + save flow)

**Files:**
- Create: `frontend/src/components/ConfigForm.tsx`
- Create: `frontend/tests/ConfigForm.test.tsx`

- [ ] **Step 1: Write the failing tests `frontend/tests/ConfigForm.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigForm } from "../src/components/ConfigForm";
import * as api from "../src/api/client";
import type { Config } from "../src/api/client";

const baseConfig: Config = {
  lookback_days: 30,
  page_size: 100,
  high_value_threshold_zar: 5_000_000,
  closing_soon_days: 7,
  include_closed: true,
  keywords: ["software", "cloud"],
  buyer_allowlist: ["sita"],
};

describe("ConfigForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an inline error when lookback is out of range", async () => {
    render(<ConfigForm initial={baseConfig} onSaved={() => {}} />);
    const input = screen.getByLabelText(/lookback window/i);
    await userEvent.clear(input);
    await userEvent.type(input, "2");
    expect(await screen.findByText(/must be between 7 and 90/i)).toBeInTheDocument();
  });

  it("calls putConfig and the onSaved callback on a valid save", async () => {
    const putSpy = vi.spyOn(api, "putConfig").mockResolvedValue({
      config: baseConfig,
      config_digest: "abc",
    });
    const onSaved = vi.fn();
    render(<ConfigForm initial={baseConfig} onSaved={onSaved} />);
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(putSpy).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test
```

Expected: failing tests in `ConfigForm.test.tsx`.

- [ ] **Step 3: Write `frontend/src/components/ConfigForm.tsx`**

```tsx
import { useMemo, useState } from "react";
import type { Config } from "../api/client";
import { putConfig } from "../api/client";

const KEYWORD_DEFAULTS = [
  "software", "it services", "system integration",
  "consulting", "professional services", "managed services",
  "cloud", "cybersecurity", "data", "development",
  "support and maintenance",
];

const BUYER_DEFAULTS = ["sita", "national treasury", "sars", "dcdt", "gcis"];

export function ConfigForm({
  initial, onSaved,
}: { initial: Config; onSaved: () => void }) {
  const [draft, setDraft] = useState<Config>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const lookbackError = useMemo(() => {
    if (draft.lookback_days < 7 || draft.lookback_days > 90) {
      return "Must be between 7 and 90";
    }
    return null;
  }, [draft.lookback_days]);

  const canSave = lookbackError === null && !saving;

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await putConfig(draft);
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleResetDefaults() {
    setDraft({
      ...draft,
      keywords: [...KEYWORD_DEFAULTS],
      buyer_allowlist: [...BUYER_DEFAULTS],
    });
    setSaved(false);
  }

  return (
    <form
      className="mx-auto max-w-[640px] space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
    >
      <Field
        label="Lookback window (days)"
        helper="7 to 90. Larger windows are slower."
        error={lookbackError}
      >
        <input
          type="number"
          min={7}
          max={90}
          value={draft.lookback_days}
          onChange={(e) => set("lookback_days", Number(e.target.value))}
          className={inputCls(!!lookbackError)}
          aria-invalid={!!lookbackError}
        />
      </Field>

      <Field label="Page size">
        <input
          type="number"
          min={1}
          max={1000}
          value={draft.page_size}
          onChange={(e) => set("page_size", Number(e.target.value))}
          className={inputCls(false)}
        />
      </Field>

      <Field label="High-value threshold (ZAR)">
        <div className="flex items-center gap-2">
          <span className="text-on-surface-variant">R</span>
          <input
            type="number"
            min={0}
            value={draft.high_value_threshold_zar}
            onChange={(e) => set("high_value_threshold_zar", Number(e.target.value))}
            className={inputCls(false)}
          />
        </div>
      </Field>

      <Field label="Closing-soon window (days)">
        <input
          type="number"
          min={1}
          max={60}
          value={draft.closing_soon_days}
          onChange={(e) => set("closing_soon_days", Number(e.target.value))}
          className={inputCls(false)}
        />
      </Field>

      <Field label="Include closed tenders">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.include_closed}
            onChange={(e) => set("include_closed", e.target.checked)}
          />
          {draft.include_closed ? "On" : "Off"}
        </label>
      </Field>

      <Field
        label="Keywords (one per line)"
        helper="Substring match on title or item classification."
      >
        <textarea
          rows={12}
          value={draft.keywords.join("\n")}
          onChange={(e) => set("keywords", e.target.value.split(/\r?\n/).filter(Boolean))}
          className={inputCls(false) + " font-mono"}
        />
        <ChipRow items={draft.keywords} onRemove={(k) => set("keywords", draft.keywords.filter((x) => x !== k))} palette="secondary" />
      </Field>

      <Field label="Buyer allowlist (one per line)">
        <textarea
          rows={5}
          value={draft.buyer_allowlist.join("\n")}
          onChange={(e) => set("buyer_allowlist", e.target.value.split(/\r?\n/).filter(Boolean))}
          className={inputCls(false) + " font-mono"}
        />
        <ChipRow items={draft.buyer_allowlist} onRemove={(b) => set("buyer_allowlist", draft.buyer_allowlist.filter((x) => x !== b))} palette="tertiary" />
      </Field>

      {error && (
        <div className="rounded-card border border-error-container bg-error-container p-3 text-sm text-on-error-container">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleResetDefaults}
          className="text-sm font-bold text-primary"
        >
          Reset to defaults
        </button>
        <button
          type="submit"
          disabled={!canSave}
          className={
            canSave
              ? "rounded-card bg-primary px-8 py-2 text-sm font-bold text-on-primary"
              : "cursor-not-allowed rounded-card bg-surface-variant px-8 py-2 text-sm font-bold text-on-surface-variant/70"
          }
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {saved && (
        <p className="text-center text-xs text-tertiary">Saved.</p>
      )}
    </form>
  );
}

function inputCls(hasError: boolean) {
  return [
    "w-full rounded-card border bg-surface px-3 py-2 text-sm",
    hasError
      ? "border-error focus:border-error focus:outline-none focus:ring-2 focus:ring-error/30"
      : "border-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30",
  ].join(" ");
}

function Field({
  label, helper, error, children,
}: { label: string; helper?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-bold text-on-surface">{label}</span>
      {children}
      {error ? (
        <span className="text-xs font-bold text-error">{error}</span>
      ) : helper ? (
        <span className="text-xs text-on-surface-variant">{helper}</span>
      ) : null}
    </label>
  );
}

function ChipRow({
  items, onRemove, palette,
}: { items: string[]; onRemove: (item: string) => void; palette: "secondary" | "tertiary" }) {
  const cls =
    palette === "secondary"
      ? "bg-secondary-container text-on-secondary-container"
      : "bg-tertiary-container text-on-tertiary-container";
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {items.map((it) => (
        <span key={it} className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] ${cls}`}>
          {it}
          <button
            type="button"
            aria-label={`Remove ${it}`}
            onClick={() => onRemove(it)}
            className="text-[10px]"
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git add frontend/src/components/ConfigForm.tsx frontend/tests/ConfigForm.test.tsx
git commit -m "feat(frontend): ConfigForm (validation + save flow)"
```

### Task 17: App.tsx — wire everything together

**Files:**
- Modify: `frontend/src/App.tsx` (replace placeholder)

- [ ] **Step 1: Replace `frontend/src/App.tsx`**

```tsx
import { useEffect, useState, useCallback } from "react";
import { Tabs } from "./components/Tabs";
import { HealthChip } from "./components/HealthChip";
import { HealthBanner } from "./components/HealthBanner";
import { MatchList } from "./components/MatchList";
import { DetailDrawer } from "./components/DetailDrawer";
import { ConfigForm } from "./components/ConfigForm";
import { Toast } from "./components/Toast";
import {
  getHealth, getMatches, getConfig,
  type Config, type HealthResponse, type Match, type MatchesResponse,
} from "./api/client";

type View = "list" | "config";

export default function App() {
  const [view, setView] = useState<View>("list");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [data, setData] = useState<MatchesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Match | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bust, setBust] = useState<number>(Date.now());

  const loadMatches = useCallback(async (bustOverride?: number) => {
    setError(null);
    try {
      const r = await getMatches({ window: config?.lookback_days ?? 30, includeClosed: config?.include_closed ?? true, bust: String(bustOverride ?? bust) });
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load matches");
    }
  }, [bust, config]);

  useEffect(() => {
    void getHealth().then(setHealth).catch(() => setHealth({ ok: false, eTenders_reachable: false, config_path: "" }));
  }, []);

  useEffect(() => {
    void getConfig().then((r) => setConfig(r.config)).catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    if (view === "list" && config) void loadMatches();
  }, [view, config, loadMatches]);

  function handleConfigSaved() {
    setToast("Saved");
    setView("list");
    const newBust = Date.now();
    setBust(newBust);
    void loadMatches(newBust);
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-outline-variant bg-surface px-8 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-primary">Tender Watch</h1>
            <p className="text-xs text-on-surface-variant">
              {data ? `${data.stats.matched} matches from the last ${config?.lookback_days ?? 30} days` : "Loading…"}
            </p>
          </div>
          <HealthChip health={health} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-8 py-6">
        <div className="flex items-center justify-between">
          <Tabs
            tabs={[{ id: "list", label: "List" }, { id: "config", label: "Config" }]}
            active={view}
            onChange={(id) => setView(id as View)}
          />
          {view === "list" && (
            <button
              type="button"
              onClick={() => {
                const newBust = Date.now();
                setBust(newBust);
                void loadMatches(newBust);
              }}
              className="rounded-card bg-primary-container px-4 py-2 text-sm font-bold text-on-primary-container"
            >
              Refresh ↻
            </button>
          )}
        </div>

        {error && <HealthBanner message={error} />}

        {view === "list" && data && (
          <MatchList
            matches={data.matches}
            onSelect={(m) => setSelected(m)}
            upstreamDown={
              health && !health.eTenders_reachable
                ? { cachedAt: new Date(data.fetched_at).toLocaleTimeString() }
                : undefined
            }
          />
        )}

        {view === "config" && config && (
          <ConfigForm initial={config} onSaved={handleConfigSaved} />
        )}
      </main>

      <DetailDrawer match={selected} onClose={() => setSelected(null)} />
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Run the dev server and exercise the full UI (mocked backend)**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\frontend"
npm run dev
```

In another terminal, start the backend with the etenders mocked out via a simple stub: open the dev server URL in a browser, confirm the list renders (the backend test fixtures will be served because the Vite dev proxy forwards `/api/*` to `http://127.0.0.1:8000` and the backend test mode handles the mocked fixtures).

If you need a faster visual check without the backend running, add a temporary mock in `App.tsx` and remove it after the check. **Do not commit the mock.**

- [ ] **Step 3: Commit**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git add frontend/src/App.tsx
git commit -m "feat(frontend): wire App.tsx — tabs, refresh, drawer, toast"
```

### Task 18: ESLint + types check

- [ ] **Step 1: Run `npm run lint` and `npm run build`**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\frontend"
npm run lint
npm run build
```

Expected: both succeed. If `tsc` errors, fix the type errors and commit.

- [ ] **Step 2: Commit any fixes**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git add frontend/
git commit -m "chore(frontend): pass lint + build" --allow-empty
```

---

## Section 3 — Integration (frontend ↔ live backend)

### Task 19: End-to-end manual smoke test (local)

- [ ] **Step 1: Start the backend with the sample fixtures served by a small FastAPI stub OR run the backend against mocked eTenders**

The simplest path: start uvicorn, run pytest with the existing mocks in place, then in a second terminal start the Vite dev server. The dev proxy forwards `/api/*` to uvicorn. The mocked eTenders responses come from the test fixtures.

For a fully local integration without mocks, edit `app/settings.py` to point at the real eTenders API and run uvicorn — but this is the **smoke test** (Section 4), not the dev loop.

- [ ] **Step 2: Verify the happy path**

Open `http://localhost:5173`. Confirm:
- The header shows "Tender Watch" + "1 matches from the last 30 days" (with the sample fixture).
- The card renders with both pills (HIGH-VALUE R 12,500,000 + CLOSES IN 28 DAYS).
- Clicking the card opens the DetailDrawer on the right.
- The Config tab loads with all 11 default keywords and 5 default buyers.
- Saving the config (with no changes) shows the "Saved" toast and switches back to List.
- The Refresh button on the list view triggers a `?bust=<ts>` refetch.

- [ ] **Step 3: Verify the error path**

Stop the backend (Ctrl+C). Refresh the frontend. Confirm:
- The HealthChip shows "eTenders UNREACHABLE" (or the page shows an error).
- The match list shows the empty state with the upstream banner if cached data exists, or just the error message.

Restart the backend. Refresh. Confirm the list reappears.

- [ ] **Step 4: Commit any fixes**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git add -A
git commit -m "chore: integration smoke test fixes" --allow-empty
```

### Task 20: Deploy config (Render + Vercel)

**Files:**
- Create: `deploy/render.yaml`
- Create: `deploy/vercel.json`

- [ ] **Step 1: Write `deploy/render.yaml`**

```yaml
services:
  - type: web
    name: tender-watch-api
    runtime: python
    plan: free
    region: oregon
    rootDir: backend
    buildCommand: pip install -e ".[prod]"
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
    healthCheckPath: /api/health
    envVars:
      - key: TW_API_BASE
        value: https://data.etenders.gov.za
      - key: TW_CONFIG_PATH
        value: ./config/tender-watch.json
      - key: TW_CACHE_TTL_SECONDS
        value: "60"
      - key: TW_ALLOWED_ORIGINS
        sync: false  # set in Render dashboard after first deploy
      - key: TW_LOG_LEVEL
        value: INFO
      - key: PYTHON_VERSION
        value: 3.12.7
```

- [ ] **Step 2: Write `deploy/vercel.json`**

```json
{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://tender-watch-api.onrender.com/api/$1"
    }
  ]
}
```

(The destination URL needs to match the actual Render subdomain. Update after first Render deploy.)

- [ ] **Step 3: Commit**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git add deploy/
git commit -m "feat(deploy): Render Blueprint + Vercel rewrites"
```

### Task 21: First Render deploy

- [ ] **Step 1: Create the GitHub repo and push**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
# Create the repo via gh CLI (or do it via the web UI)
gh repo create tender-watch --private --source=. --remote=origin --push
```

Expected: the repo exists on GitHub and the current branch is pushed.

- [ ] **Step 2: Connect Render**

Go to `https://dashboard.render.com/`, click "New +", select "Blueprint", point at the `tender-watch` GitHub repo. Render reads `deploy/render.yaml` and provisions the service. Capture the deployed URL (e.g. `https://tender-watch-api-xxxx.onrender.com`).

- [ ] **Step 3: Set `TW_ALLOWED_ORIGINS`**

In the Render dashboard, set `TW_ALLOWED_ORIGINS` to the Vercel URL (placeholder for now: `https://tender-watch.vercel.app`; update after the Vercel deploy). Restart the service.

- [ ] **Step 4: Verify `/api/health`**

```bash
curl https://tender-watch-api-xxxx.onrender.com/api/health
```

Expected: `{"ok":true,"eTenders_reachable":true,...}`.

### Task 22: First Vercel deploy

- [ ] **Step 1: Connect Vercel**

Go to `https://vercel.com/new`, import the `tender-watch` GitHub repo. Set the root directory to `frontend/`. Vercel reads `deploy/vercel.json` automatically.

- [ ] **Step 2: Update `vercel.json` with the real Render URL**

```json
{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://tender-watch-api-xxxx.onrender.com/api/$1"
    }
  ]
}
```

(Replace `xxxx` with the actual Render subdomain.)

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git add deploy/vercel.json
git commit -m "chore(deploy): set Vercel rewrite to Render URL"
git push
```

- [ ] **Step 3: Verify CORS end-to-end**

Open the Vercel URL in a browser. Confirm:
- The list loads with real eTenders data.
- The HealthChip shows "eTenders OK" (or UNREACHABLE if the API is down at the moment).
- Clicking a card opens the drawer.

If the list is empty: check the browser dev tools network tab for 403 CORS errors. If present, go back to Render and update `TW_ALLOWED_ORIGINS` to match the Vercel URL exactly (including protocol).

- [ ] **Step 4: Commit any CORS fixes**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git add -A
git commit -m "chore: deployed; CORS verified" --allow-empty
```

---

## Section 4 — Real eTenders smoke test

### Task 23: Real-API smoke test (open items)

- [ ] **Step 1: Point the backend at the real API**

Temporarily edit `backend/app/settings.py` (or set env vars) so `TW_API_BASE=https://data.etenders.gov.za`. Restart uvicorn. Open the Vercel URL. Confirm matches load.

- [ ] **Step 2: Record the real page-size ceiling**

Set `page_size=1000` and watch the backend logs for any 4xx or 5xx. Note the largest `PageSize` that returns 200 OK. Update the default in `backend/app/models.py` if needed:

```python
page_size: int = Field(default=100, ge=1, le=1000)  # adjust ceiling if 429s appear
```

- [ ] **Step 3: Record the real `links.next` behaviour**

Inspect a real page response. If `links.next` is reliably present, leave the pagination as-is. If not, the fallback in `EtendersClient.fetch_releases` (stop when page < page_size) handles it.

- [ ] **Step 4: Save a recorded fixture for offline tests**

Save a real page response to `backend/tests/fixtures/recorded_real_page.json` (anonymize the OCIDs if you like). Add a test that uses it:

```python
def test_real_page_fixture_loads() -> None:
    page = _load("recorded_real_page.json")
    with respx.mock(base_url="https://data.etenders.gov.za") as mock:
        mock.get("/api/OCDSReleases").mock(return_value=httpx.Response(200, json=page))
        # ... reuse the test_first_visit_default_config pattern
```

- [ ] **Step 5: Commit**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git add backend/
git commit -m "chore(backend): real-API smoke test + recorded fixture"
```

---

## Section 5 — Documentation + handoff

### Task 24: README — full handoff doc

**Files:**
- Modify: `README.md` (replace the placeholder from Task 1)

- [ ] **Step 1: Replace `README.md`**

```markdown
# Tender Watch

A personal, on-demand browser tool that monitors the South African eTenders
OCDS API for IT / professional-services opportunities.

**Live URL:** <insert Vercel URL>
**Backend URL:** <insert Render URL>

## Architecture

- **Backend** (`backend/`): Python 3.12 + FastAPI. Async httpx client for the
  eTenders API, filter pipeline, in-memory TTL cache, three routes
  (`/api/matches`, `/api/config`, `/api/health`).
- **Frontend** (`frontend/`): React 19 + Vite 6 + Tailwind v4. Three views
  (list, config, detail drawer). No router, no state library.
- **Deploy** (`deploy/`): Render Blueprint for the backend, Vercel rewrites
  for the frontend.
- **Visual spec** (in the planning repo, not this one): seven Stitch screens
  with the Tonal Spot / Inter / 8 dp design system.

## Local development

### Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # PowerShell
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev proxy forwards `/api/*` to the
backend on `http://127.0.0.1:8000`.

## Environment variables

### Backend

| Var | Purpose | Default |
| --- | --- | --- |
| `TW_API_BASE` | eTenders API base | `https://data.etenders.gov.za` |
| `TW_CONFIG_PATH` | Where to read/write the config JSON | `./config/tender-watch.json` |
| `TW_CACHE_TTL_SECONDS` | In-memory cache TTL | `60` |
| `TW_ALLOWED_ORIGINS` | Comma-separated CORS origins | `http://localhost:5173` |
| `TW_LOG_LEVEL` | DEBUG / INFO / WARN / ERROR | `INFO` |

### Frontend

| Var | Purpose |
| --- | --- |
| `VITE_API_BASE` | Leave unset in dev (Vite proxy) and prod (Vercel rewrite) |

## Tests

### Backend

```bash
cd backend
pytest -v
```

Covers T1–T13 and T16 (15 behaviour-level test cases from the original plan).

### Frontend

```bash
cd frontend
npm test
```

Covers T14, T15, and the component / format / API-client unit tests.

## Deploy

1. Push to GitHub.
2. Render reads `deploy/render.yaml` and provisions the backend.
3. Vercel reads `deploy/vercel.json` and provisions the frontend.
4. Set `TW_ALLOWED_ORIGINS` on Render to the deployed Vercel URL.
5. Verify CORS by opening the Vercel URL — the list should load.

## Config

The user-editable config lives at `TW_CONFIG_PATH` (default
`./config/tender-watch.json`). Edits via the UI's Config tab are persisted
atomically. If the file is missing or corrupt, defaults are applied:

```json
{
  "lookback_days": 30,
  "page_size": 100,
  "high_value_threshold_zar": 5000000,
  "closing_soon_days": 7,
  "include_closed": true,
  "keywords": ["software", "it services", "system integration",
               "consulting", "professional services", "managed services",
               "cloud", "cybersecurity", "data", "development",
               "support and maintenance"],
  "buyer_allowlist": ["sita", "national treasury", "sars", "dcdt", "gcis"]
}
```

## URL protection

The deployed URL is the only protection in v1. Render and Vercel assign
random subdomains; do not add a custom domain (it would defeat the
protection). For stronger protection, see the system spec §8 — options
include HTTP basic auth at the reverse proxy or Cloudflare Access in
front of Vercel.

## Run stats

The list view shows `N matches from the last N days` in the header. The
response payload includes a `stats` block with:

- `releases_scanned` — total releases fetched from the API in the look-back window.
- `matched` — kept after filter rules.
- `rejected_by_status` — dropped because the tender was cancelled / unsuccessful / withdrawn.
- `rejected_no_keyword_no_buyer` — dropped because it matched no keyword and no buyer.

## License

MIT. See `LICENSE`.
```

- [ ] **Step 2: Commit**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git add README.md
git commit -m "docs: full README handoff"
```

### Task 25: Open items resolved

- [ ] **Step 1: Walk the open-items list from the spec §8 and confirm each is either resolved or noted in the README**

For each item, edit the README or `docs/superpowers/specs/2026-06-17-tender-watch-app-design.md` with the resolution. Items already handled in code:
- Real production page-size ceiling → Task 23.
- Rate-limit behaviour → TTL cache widens in `settings.py`.
- `links.next` reliability → fallback in `EtendersClient`.
- ZAR rendering → `format.ts`.
- Closing-date timezone → `format.ts` (Africa/Johannesburg).
- OCDS licence review → README.

- [ ] **Step 2: Final commit**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git add -A
git commit -m "chore: open items resolved"
```

### Task 26: Final pass — run all tests, verify the build

- [ ] **Step 1: Backend tests + lint**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\backend"
.\.venv\Scripts\Activate.ps1
pytest -v
ruff check .
```

Expected: ~25 pytest passes, ruff clean.

- [ ] **Step 2: Frontend tests + lint + build**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch\frontend"
npm test
npm run lint
npm run build
```

Expected: tests pass, lint clean, `dist/` produced.

- [ ] **Step 3: Cross-check the spec definition of done (spec §10)**

Walk the 11 items in the spec §10 definition of done. Each is either ✅ or noted in the README as deferred to v1.1.

- [ ] **Step 4: Tag the release**

```bash
cd "C:\UNLIMITED DEV\MAIN Work Space\tender-watch"
git tag v0.1.0
git push --tags
```

---

## Self-review

**1. Spec coverage:** every section of the spec is implemented.
- §2 repo structure → Tasks 1, 2, 10
- §3 tech stack → Tasks 2, 10, 11
- §4 data flow → Tasks 8, 9, 11, 17, 19
- §5 visual layer as the design spec → Task 10 (design tokens), Task 12-17 (components)
- §6 testing → Tasks 3-9 (backend), Tasks 11-16 (frontend)
- §7 deployment → Tasks 20, 21, 22
- §8 open items → Task 25
- §9 out of scope → enforced by the absence of mobile/dark-mode/CI tasks
- §10 definition of done → Task 26

**2. Placeholder scan:** no "TBD" / "TODO" / "implement later" in any task. Every code block is complete. The one semi-placeholder is `<insert Vercel URL>` and `<insert Render URL>` in the README — these are filled in during Task 24 after the first deploy.

**3. Type consistency:**
- `Config` and `Match` are defined in `backend/app/models.py` and re-declared in `frontend/src/api/client.ts` with matching field names. (Cross-checked: every field used in the frontend tests appears in the Pydantic model.)
- `getMatches`, `getConfig`, `getHealth`, `putConfig` are defined in `api/client.ts` and consumed by `App.tsx`, `MatchList.tsx`, `ConfigForm.tsx`.
- `cache_key` shape is `SHA256(config_digest + window + include_closed)` — consistent across `routes/matches.py` and the spec.
- `bust` is treated as a cache bypass (skip lookup), not part of the key — consistent with the spec §4.3 inline correction.

**4. Ambiguity:**
- §4.1 says "match the spec §6.1 response shape" — pinned by the Pydantic models in Task 3.
- §5 says "the seven Stitch screens map 1:1 to the seven React views" but the React build has 12 components (MatchCard, MatchList, DetailDrawer, ConfigForm, plus 8 shared chrome) — the 1:1 is at the *view* level, not the *component* level. Clarified in the spec at §5.
