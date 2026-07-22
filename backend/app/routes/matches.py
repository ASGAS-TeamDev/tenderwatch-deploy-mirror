"""GET /api/matches — fetch, filter, dedupe, cache."""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
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


def _config_digest(config) -> str:  # type: ignore[no-untyped-def]
    blob = json.dumps(config.model_dump(), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


@router.get("/api/matches", response_model=MatchesResponse)
async def get_matches(
    window: int = Query(30, ge=1, le=365),
    include_closed: bool = Query(True),
    bust: str | None = Query(None, description="Set to a unique value to bypass the cache."),
) -> MatchesResponse:
    global _last_good

    config = load_config(settings.config_path)
    config_digest = _config_digest(config)
    effective_include_closed = include_closed and config.include_closed

    key = _cache_key(config_digest, window, effective_include_closed)
    force_refresh = bust is not None

    async def loader() -> MatchesResponse:
        now = datetime.now(timezone.utc)
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
                        date_from=date_from, date_to=date_to, page_size=config.page_size,
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
            # Exhaustion → 503 with cached_response.
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "upstream_unavailable",
                    "cached_response": _last_good.model_dump() if _last_good else None,
                },
            )

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
