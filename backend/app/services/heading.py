"""Claude-generated short headings for tender descriptions.

Calls the Claude Messages API directly via httpx (no SDK dependency —
consistent with services/etenders.py's plain-httpx approach). Results are
cached in-process for the life of the run; a personal, single-instance
tool never needs this to survive a restart (same assumption the raw
release cache already makes — see services/cache.py).
"""
from __future__ import annotations

import logging

import httpx

from app.services.cache import TTLCache
from app.settings import settings

log = logging.getLogger(__name__)

_MODEL = "claude-haiku-4-5-20251001"
_API_URL = "https://api.anthropic.com/v1/messages"

# Effectively permanent for the life of the process — a tender's heading
# never changes once generated.
_cache: TTLCache[str, str] = TTLCache(ttl_seconds=60 * 60 * 24 * 365)


async def get_heading(ocid: str, title: str, description: str) -> str:
    """Short (2-5 word) heading summarising what's being procured.

    Returns "" if no API key is configured or generation fails — callers
    treat that as "no heading available" rather than an error.
    """
    if not settings.anthropic_api_key:
        return ""

    async def _load() -> str:
        return await _fetch_heading(title, description)

    try:
        return await _cache.get_or_load(ocid, _load)
    except Exception:
        log.exception("heading generation failed for ocid=%s", ocid)
        return ""


async def _fetch_heading(title: str, description: str) -> str:
    prompt = (
        "Extract a concise 2-5 word heading describing the core service or "
        "product being procured, from this tender. Reply with ONLY the "
        "heading — no punctuation, quotes, or explanation.\n\n"
        f"Title: {title}\nDescription: {description[:1000]}"
    )
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            _API_URL,
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": _MODEL,
                "max_tokens": 20,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        data = resp.json()

    text = "".join(
        block.get("text", "") for block in data.get("content", []) if block.get("type") == "text"
    )
    return text.strip().strip('"').strip("'")
