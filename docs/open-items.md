---
# Open Items Resolved
Status of every open item tracked across the v0.1.0 build. Sourced from `scope.md` "Open questions", design spec §9 "What the spec deliberately does not pin", and the implementation plan §5 "Open items for the implementer to confirm during build". All planning-repo files are read-only.
---

## Resolved during build

- **Rate limits & quota** (scope.md Open questions 1; implementation plan §5 item 2)
  - **Decision:** In-memory TTL cache (60 s default) absorbs burst traffic; `cache_ttl_seconds` is configurable via `TW_CACHE_TTL_SECONDS`.
  - **Where it lives:** `backend/app/settings.py:18` (`cache_ttl_seconds: int = 60`); `backend/app/services/cache.py` (TTLCache implementation, commit `ededeb2`).

- **Page size ceiling** (scope.md Open questions 2; implementation plan §5 item 1)
  - **Decision:** Conservative default `page_size=100`, validated range 1–1000 via Pydantic. Real ceiling to be confirmed in Task 23 (smoke test).
  - **Where it lives:** `backend/app/models.py:21` (`page_size: int = Field(default=100, ge=1, le=1000)`).

- **Category data quality / fallback to title** (scope.md Open questions 3)
  - **Decision:** Filter pipeline matches keywords against BOTH `tender.title` and the concatenation of `tender.items[].classification.description`.
  - **Where it lives:** `backend/app/services/filter.py` (lines building `title_lower` and `item_text` and matching `config.keywords` against both; commit `75190c7`).

- **Closing-date filtering — include closed tenders with a tag** (scope.md Open questions 4)
  - **Decision:** Closed tenders are kept and tagged `"closed"` via the `include_closed` flag (defaults to `True`); tag rendered as the `CLOSED` pill in the UI.
  - **Where it lives:** `backend/app/models.py:24` (`include_closed: bool = True`); `backend/app/services/filter.py` flag logic; `frontend/src/components/FlagPill.tsx:14` (CLOSED pill).

- **Look-back window default** (scope.md Open questions 5)
  - **Decision:** Default `lookback_days=30`, range 7–90 via Pydantic; user-editable in the Config tab.
  - **Where it lives:** `backend/app/models.py:20` (`lookback_days: int = Field(default=30, ge=7, le=90)`); `frontend/src/components/ConfigForm.tsx` (lookback input).

- **Whether `links.next` is reliable** (implementation plan §5 item 3)
  - **Decision:** Pagination stops when EITHER the page is short OR `links.next` is missing. Fallback covers both behaviours.
  - **Where it lives:** `backend/app/services/etenders.py:49` (`if len(releases) < page_size or not links.get("next"): return out`); commit `d3e9b74`.

- **Hosting choice** (implementation plan §5 item 4; design spec §9 item 1)
  - **Decision:** Render Blueprint for the FastAPI backend, Vercel rewrites for the frontend. Configured under `deploy/`.
  - **Where it lives:** `deploy/render.yaml`; `deploy/vercel.json` (commit deferred to Task 20 deploy step).

- **UI styling** (implementation plan §5 item 5; design spec §9 item 3)
  - **Decision:** Tailwind v4 with design tokens lifted from the Stitch Tonal Spot / Inter / 8 dp theme. No component library.
  - **Where it lives:** `frontend/src/styles.css` (`@theme` block, commit `182740d`).

- **Backend rendering of value in ZAR** (implementation plan §5 item 6)
  - **Decision:** `null` → `"R —"`; numeric → `"R <formatted>"`. Backend `_format_zar` for cached response; frontend `formatZAR` mirrors it for live use.
  - **Where it lives:** `backend/app/services/filter.py` (`_format_zar`); `frontend/src/lib/format.ts:6` (`formatZAR`, commit `5181f0e`).

- **Closing-date timezone** (implementation plan §5 item 7)
  - **Decision:** Render dates in `Africa/Johannesburg` (UTC+2). Backend keeps the raw ISO string; formatting happens client-side.
  - **Where it lives:** `frontend/src/lib/format.ts:13` (`Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", … })`); commit `5181f0e`.

- **OCDS schema compliance / Public Domain Dedication Licence** (implementation plan §5 item 8; design spec §8)
  - **Decision:** README and the implementation note the licence; raw release data is shown as text only (XSS rule). Personal-tool use is permitted under the PDDL; a public republishing site would need its own review.
  - **Where it lives:** `README.md` ("License" section, MIT for our code); design spec §8 (licence note).

- **Test framework choice** (design spec §9 item 2)
  - **Decision:** pytest + respx + pytest-asyncio for backend; Vitest + @testing-library/react for frontend.
  - **Where it lives:** `backend/pyproject.toml` (`[tool.pytest.ini_options]`); `frontend/package.json` (`vitest`, `@testing-library/*`); commit `acc8b2c` + `182740d`.

- **Cache state across instances** (design spec §9 item 4)
  - **Decision:** In-process cache is acceptable for v1 because the spec deploys one Render instance. Documented in the implementation plan §6 deployment notes (single-instance assumption); would move to Redis only if multi-instance is needed.
  - **Where it lives:** `backend/app/services/cache.py` (TTLCache; commit `ededeb2`).

## Deferred to v0.2.0

- **Real production page-size ceiling probe** (implementation plan §5 item 1, scope.md Open questions 2)
  - **Why deferred:** The spec quotes "up to 1000 in browser, 20000+ via Postman" — needs a live probe against `data.etenders.gov.za`. The conservative default of 100 with validation up to 1000 is shipped in v0.1.0; the precise ceiling is confirmed in Task 23 (real-API smoke test) and recorded in `backend/tests/fixtures/recorded_real_page.json`. No user-facing change either way in v0.1.0.

## Out of scope by design

- **Email digest delivery** (scope.md "Delivery pivot")
  - **Citation:** scope.md "Delivery pivot" — the earlier email-digest design was explicitly superseded by the on-demand browser view. Out of scope for v1; no scheduler, no SMTP, no email.

- **Scheduled jobs / persistent job queue** (design spec §5.1 "Persistent state")
  - **Citation:** Design spec §5.1 states the only persisted state is the editable config JSON; no scheduled job and no persistent application state. Fresh fetch every page load is the v1 design.

- **Authentication / user accounts** (scope.md "Auth" row)
  - **Citation:** scope.md "Key design decisions" — "None in v1. URL is the only protection." Out of scope for v1; design spec §8 lists reverse-proxy basic auth and Cloudflare Access as future mitigations.

- **Multi-instance horizontal scale-out** (design spec §9 item 4)
  - **Citation:** Design spec §9 — "in-process is fine for v1 (one instance). Documented as a deployment note." Cache state across instances would require a shared cache (Redis, etc.), which is out of scope for v1.

- **OCDS schema compliance audit for public republishing** (implementation plan §5 item 8; design spec §8)
  - **Citation:** Design spec §8 — "A public-facing republishing site would need its own licence review." v1 is a personal tool on a random Render subdomain; a public republishing licence audit is out of scope for v1.

- **Dark mode** (design spec §9 + implementation plan §9 self-review)
  - **Citation:** Implementation plan §9 self-review ("§9 out of scope → enforced by the absence of mobile/dark-mode/CI tasks"). Not in scope for v1; would re-apply the design tokens under a dark variant if added later.
