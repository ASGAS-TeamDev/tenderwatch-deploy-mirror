"""Claude-generated executive summaries of a tender's PDF document.

Downloads the tender's first PDF document and has Claude read and
summarise it directly (native PDF document support in the Messages API —
no separate text-extraction step). Unlike heading.py's quick extraction,
this reads a real document and produces prose the user reads directly, so
it uses Sonnet rather than Haiku. Cached in-process per ocid, same
single-instance assumption as the rest of the app (see services/cache.py).
"""
from __future__ import annotations

import base64
import logging

import httpx

from app.services.cache import TTLCache
from app.settings import settings

log = logging.getLogger(__name__)

_MODEL = "claude-sonnet-5"
_API_URL = "https://api.anthropic.com/v1/messages"

_cache: TTLCache[str, str] = TTLCache(ttl_seconds=60 * 60 * 24 * 365)


class SummaryError(Exception):
    """Raised for a failure the caller should surface to the user (as
    opposed to one that's fine to just show as \"no summary available\")."""


async def get_summary(ocid: str, title: str, doc_url: str, doc_format: str) -> str:
    if not settings.anthropic_api_key:
        raise SummaryError("Executive summaries aren't configured (no Anthropic API key).")
    if doc_format.lower() != "pdf":
        return f"No PDF document available to summarize for this tender (only a .{doc_format} file is published)."

    async def _load() -> str:
        return await _fetch_summary(title, doc_url)

    return await _cache.get_or_load(ocid, _load)


async def _fetch_summary(title: str, doc_url: str) -> str:
    async with httpx.AsyncClient(timeout=60.0) as client:
        doc_resp = await client.get(doc_url)
        doc_resp.raise_for_status()
        pdf_b64 = base64.b64encode(doc_resp.content).decode("ascii")

        prompt = (
            f"This is a South African government tender document for: {title}\n\n"
            "Summarize it as a concise bulleted list of the key items a bidder needs to "
            "know: what is being procured and why, the scope of work, key requirements or "
            "qualifications bidders must meet, and any other critical details (deadlines, "
            "compliance obligations, etc.). Keep each bullet to one short line where "
            "possible — aim for 6-10 bullets total. Start every bullet with \"- \". No "
            "headings, no intro/preamble, no prose paragraphs — bullets only."
        )
        resp = await client.post(
            _API_URL,
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": _MODEL,
                "max_tokens": 1024,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "document",
                                "source": {
                                    "type": "base64",
                                    "media_type": "application/pdf",
                                    "data": pdf_b64,
                                },
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
            },
        )
        resp.raise_for_status()
        data = resp.json()

    text = "".join(
        block.get("text", "") for block in data.get("content", []) if block.get("type") == "text"
    )
    if not text.strip():
        raise SummaryError("Claude returned an empty summary.")
    return text.strip()
