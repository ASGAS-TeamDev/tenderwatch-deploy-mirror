"""GET /api/matches — fetch, filter, dedupe, cache.

Caching is split into two layers so a config edit (keywords, buyer
allowlist, favourites, include_closed) never forces a slow upstream
re-fetch:

- `_cache` holds the raw eTenders releases, keyed only by the
  (window, page_size) that actually shapes the upstream request. This is
  the expensive, network-bound part — TTL'd and shared across every
  config.
- Filtering (`apply_rules` per release, using the *current* config) runs
  fresh on every request against whatever raw releases are cached. It's
  pure in-memory work over at most a few thousand releases, so it's
  effectively free — no need to cache its output separately.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from app.config_store import load_config
from app.models import Match, MatchesResponse, Stats, SummaryResponse
from app.services import db
from app.services.cache import TTLCache
from app.services.etenders import EtendersClient, EtendersError
from app.services.filter import apply_rules
from app.services.heading import get_heading
from app.services.summary import SummaryError, get_summary
from app.settings import settings

router = APIRouter()
log = logging.getLogger(__name__)


@dataclass
class _RawReleases:
    releases: list[dict[str, Any]]
    fetched_at: datetime
    date_from: str
    date_to: str


# Process-local cache of raw upstream releases. One instance per process;
# on restart it re-warms. Keyed by (window, page_size) only — NOT by
# config — so keyword/buyer/favourite/include_closed edits are filtered
# from whatever's already cached instead of triggering a re-fetch.
_cache: TTLCache[str, _RawReleases] = TTLCache(ttl_seconds=settings.cache_ttl_seconds)
_last_good: MatchesResponse | None = None


def _raw_cache_key(window: int, page_size: int) -> str:
    blob = json.dumps({"w": window, "ps": page_size}, sort_keys=True)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _config_digest(config) -> str:  # type: ignore[no-untyped-def]
    blob = json.dumps(config.model_dump(), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


async def _fetch_raw(window: int, page_size: int) -> _RawReleases:
    """Get raw releases for `window` days — from Postgres if configured
    (production: nightly n8n sync), otherwise live from eTenders (dev
    fallback, no TW_DATABASE_URL needed to run the app locally)."""
    if settings.database_url:
        return await _fetch_raw_db(window)
    return await _fetch_raw_live(window, page_size)


async def _fetch_raw_db(window: int) -> _RawReleases:
    now = datetime.now(UTC)
    try:
        releases = await db.fetch_releases_from_db(window)
        last_sync = await db.fetch_last_sync()
    except Exception as exc:  # asyncpg connection/query errors
        raise EtendersError(f"database unavailable: {exc}") from exc
    date_to = now.isoformat().replace("+00:00", "Z")
    date_from = (now - timedelta(days=window)).isoformat().replace("+00:00", "Z")
    return _RawReleases(
        releases=releases, fetched_at=last_sync or now, date_from=date_from, date_to=date_to,
    )


async def _fetch_raw_live(window: int, page_size: int) -> _RawReleases:
    now = datetime.now(UTC)
    date_to = now.isoformat().replace("+00:00", "Z")
    date_from = (now - timedelta(days=window)).isoformat().replace("+00:00", "Z")

    releases: list[dict[str, Any]] = []
    # Exponential backoff: 1s, 5s, 25s — 3 attempts on 5xx.
    # 4xx and network errors fail fast (no point retrying a 404).
    delays = [1, 5, 25]
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            async with EtendersClient(base_url=settings.api_base) as client:
                releases = await client.fetch_releases(
                    date_from=date_from, date_to=date_to, page_size=page_size,
                )
            last_exc = None
            break
        except EtendersError as exc:
            last_exc = exc
            if attempt < 2:
                await asyncio.sleep(delays[attempt])
        except httpx.HTTPError as exc:
            # 4xx, network errors, timeouts — all upstream failures.
            # No retry: a 404/401 keeps failing, and a timeout usually means we're rate-limited.
            last_exc = EtendersError(f"upstream {type(exc).__name__}: {exc}")
            break
    if last_exc is not None:
        raise last_exc
    return _RawReleases(releases=releases, fetched_at=now, date_from=date_from, date_to=date_to)


async def _filter_releases(
    raw: _RawReleases, config, config_digest: str, *, show_all: bool = False,
) -> MatchesResponse:  # type: ignore[no-untyped-def]
    now = datetime.now(UTC)  # fresh, so closing-soon/days_to_close stay accurate
    seen: set[str] = set()
    matched: list[Match] = []
    rejected_status = 0
    rejected_no_kb = 0
    for r in raw.releases:
        ocid = r.get("ocid", "")
        if ocid in seen:
            continue
        seen.add(ocid)
        result = apply_rules(r, config, now=now, show_all=show_all)
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
                description=result.description,
                status=result.status,
                procurement_method=result.procurement_method,
                delivery_location=result.delivery_location,
                special_conditions=result.special_conditions,
                contact_person=result.contact_person,
                briefing_session=result.briefing_session,
                documents=result.documents,
                published_date=result.published_date,
                tender_start_date=result.tender_start_date,
            )
        )

    # Claude-generated headings — cached per-ocid (see services/heading.py),
    # so this is only real latency the first time a given tender is seen.
    headings = await asyncio.gather(
        *(get_heading(m.ocid, m.title, m.description) for m in matched)
    )
    for m, heading in zip(matched, headings):
        m.heading = heading

    return MatchesResponse(
        fetched_at=raw.fetched_at,
        window={"from": raw.date_from, "to": raw.date_to},
        config_digest=config_digest,
        stats=Stats(
            releases_scanned=len(raw.releases),
            matched=len(matched),
            rejected_by_status=rejected_status,
            rejected_no_keyword_no_buyer=rejected_no_kb,
        ),
        matches=matched,
    )


@router.get("/api/matches", response_model=MatchesResponse)
async def get_matches(
    window: int = Query(30, ge=1, le=365),
    include_closed: bool = Query(True),
    bust: str | None = Query(None, description="Set to a unique value to bypass the cache."),
    show_all: bool = Query(False, description="Bypass the keyword/buyer filter — show every non-rejected release."),
) -> MatchesResponse:
    global _last_good

    config = load_config(settings.config_path)
    config_digest = _config_digest(config)
    # Only affects filtering (see apply_rules) — not the upstream fetch —
    # so it plays no part in the raw-cache key.
    config = config.model_copy(update={"include_closed": include_closed and config.include_closed})

    raw_key = _raw_cache_key(window, config.page_size)

    async def loader() -> _RawReleases:
        return await _fetch_raw(window, config.page_size)

    try:
        if bust is not None:
            # Bust: always re-fetch synchronously (user changed filter, wants
            # fresh data). This is the only path that blocks the caller on an
            # upstream fetch; it's rare (only on config save / explicit refresh).
            _cache.invalidate(raw_key)
            raw = await _cache.get_or_load(raw_key, loader)
        else:
            # Stale-while-revalidate: serve fresh or stale instantly, refresh
            # in the background when expired. After the first warm, callers
            # never block on an upstream fetch.
            raw = await _cache.get_or_load_stale(raw_key, loader)
    except EtendersError:
        # Exhaustion → 503 with cached_response. Use mode="json" so
        # datetime fields are serialized to ISO strings — FastAPI's
        # error handler uses stdlib json.dumps which can't handle
        # raw datetime objects (would raise TypeError → 500).
        raise HTTPException(
            status_code=503,
            detail={
                "error": "upstream_unavailable",
                "cached_response": (
                    _last_good.model_dump(mode="json") if _last_good else None
                ),
            },
        )

    response = await _filter_releases(raw, config, config_digest, show_all=show_all)
    _last_good = response
    return response


@router.get("/api/matches/{ocid}/summary", response_model=SummaryResponse)
async def get_match_summary(ocid: str) -> SummaryResponse:
    if _last_good is None:
        raise HTTPException(status_code=404, detail="No matches loaded yet — load the list first.")
    match = next((m for m in _last_good.matches if m.ocid == ocid), None)
    if match is None:
        raise HTTPException(status_code=404, detail="Tender not found in the current match set.")
    if not match.documents:
        raise HTTPException(status_code=404, detail="This tender has no published documents to summarize.")

    doc = match.documents[0]
    try:
        summary = await get_summary(ocid, match.title, doc.url, doc.format or "")
    except SummaryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502, detail=f"Failed to fetch or summarize the document: {exc}",
        ) from exc
    return SummaryResponse(summary=summary)


@router.get("/api/matches/{ocid}/documents/{index}/view")
async def view_document(ocid: str, index: int) -> Response:
    """Streams a tender's PDF back through our own origin with
    `Content-Disposition: inline` so the browser renders it in a tab
    instead of downloading it — eTenders serves every document with
    `Content-Disposition: attachment`, which forces a download no matter
    what the link in the frontend does, so this has to be a same-origin
    proxy (a plain `target="_blank"` link can't override that header)."""
    if _last_good is None:
        raise HTTPException(status_code=404, detail="No matches loaded yet — load the list first.")
    match = next((m for m in _last_good.matches if m.ocid == ocid), None)
    if match is None:
        raise HTTPException(status_code=404, detail="Tender not found in the current match set.")
    if index < 0 or index >= len(match.documents):
        raise HTTPException(status_code=404, detail="Document not found.")
    doc = match.documents[index]

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(doc.url)
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch the document: {exc}") from exc

    # Strip characters that would break the Content-Disposition header and
    # force a .pdf extension — the title alone doesn't always carry one.
    safe_title = re.sub(r'[\r\n"]', "", doc.title or "document").strip() or "document"
    filename = safe_title if safe_title.lower().endswith(".pdf") else f"{safe_title}.pdf"
    return Response(
        content=resp.content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


async def warm_default_cache() -> MatchesResponse | None:
    """Pre-warm the raw-releases cache for the current config's lookback window.

    Called at startup and on a recurring schedule (see main.py). Loads
    config fresh each call so config changes are picked up without a
    restart. Failures are logged and swallowed — a failed warm leaves
    the cache as-is (stale or empty); the next request will cold-load.
    """
    try:
        config = load_config(settings.config_path)
        window = config.lookback_days
        raw_key = _raw_cache_key(window, config.page_size)

        # If already fresh, nothing to do.
        if _cache.get(raw_key) is not None:
            return _last_good

        log.info("warming cache for window=%s", window)
        # Reuse the route handler so the loader, filtering, and stats
        # are identical to a real request. Bust is unset so the result
        # lands in the cache.
        response = await get_matches(
            window=window, include_closed=config.include_closed, bust=None,
        )
        return response
    except Exception:
        log.exception("cache warm failed")
        return None
