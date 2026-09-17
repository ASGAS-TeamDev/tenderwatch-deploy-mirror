"""Async client for the eTenders OCDS Public API.

Base URL: https://ocds-api.etenders.gov.za (was data.etenders.gov.za; relocated).
Endpoint: GET /api/OCDSReleases?dateFrom=...&dateTo=...&PageNumber=...&PageSize=...

We follow `links.next` if present (the API returns a full absolute URL with
its own query string), and fall back to incrementing PageNumber otherwise.

Each page fetch is retried with exponential backoff (2s, 8s, 20s) on 5xx
or network errors. The eTenders API is intermittently flaky on individual
pages — retrying the page (not the whole fetch) avoids losing all the
work from earlier pages.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

log = logging.getLogger(__name__)


class EtendersError(Exception):
    """Raised on unrecoverable upstream errors."""


class EtendersClient:
    def __init__(self, base_url: str, timeout: float = 60.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(base_url=self._base_url, timeout=timeout)

    async def __aenter__(self) -> "EtendersClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self._client.aclose()

    async def _get_with_retry(
        self, url: str, params: dict[str, Any] | None = None,
        max_retries: int = 3,
    ) -> httpx.Response:
        """GET with per-page retry on 5xx / network errors.

        4xx errors fail fast (no point retrying a 404/401).
        """
        delays = [2, 8, 20]
        last_exc: Exception | None = None
        for attempt in range(max_retries):
            try:
                if url.startswith("http://") or url.startswith("https://"):
                    resp = await self._client.get(url)
                else:
                    resp = await self._client.get(url, params=params)

                if resp.status_code >= 500:
                    last_exc = EtendersError(f"upstream {resp.status_code}")
                    if attempt < max_retries - 1:
                        log.warning(
                            "eTenders page returned %s, retry %d/%d in %ds",
                            resp.status_code, attempt + 1, max_retries - 1,
                            delays[attempt],
                        )
                        await asyncio.sleep(delays[attempt])
                        continue
                    raise last_exc
                resp.raise_for_status()
                return resp
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < max_retries - 1:
                    log.warning(
                        "eTenders page fetch failed (%s), retry %d/%d in %ds",
                        type(exc).__name__, attempt + 1, max_retries - 1,
                        delays[attempt],
                    )
                    await asyncio.sleep(delays[attempt])
                    continue
                raise EtendersError(f"upstream {type(exc).__name__}: {exc}") from exc
        # Shouldn't reach here, but satisfy the type checker.
        raise last_exc  # type: ignore[misc]

    async def fetch_releases(
        self, *, date_from: str, date_to: str, page_size: int = 100,
    ) -> list[dict[str, Any]]:
        """Fetch all releases in the date window, paginating until exhausted."""
        page = 1
        out: list[dict[str, Any]] = []
        # If the API returns a full `links.next` URL we follow it; otherwise we
        # increment PageNumber. Same loop — the variable carries either the
        # path (relative) or the absolute URL we should GET next.
        next_path: str | None = "/api/OCDSReleases"
        next_params: dict[str, Any] = {
            "dateFrom": date_from,
            "dateTo": date_to,
            "PageNumber": page,
            "PageSize": page_size,
        }
        # Guard against infinite loops on misbehaving pagination.
        max_pages = 200
        for _ in range(max_pages):
            if next_path is None:
                # Shouldn't happen (we set it back to None only when stopping),
                # but keep the type-checker happy.
                return out
            # Per-page retry: the eTenders API is intermittently flaky on
            # individual pages. Retrying the page (not the whole fetch)
            # avoids losing all the work from earlier pages.
            resp = await self._get_with_retry(next_path, params=next_params)
            data = resp.json()
            releases = data.get("releases", [])
            out.extend(releases)
            links = data.get("links") or {}
            next_url = links.get("next")
            if next_url:
                # Follow the link verbatim.
                next_path = next_url
                next_params = {}
            else:
                # No link — stop if short page, otherwise try the next page
                # number on the same endpoint.
                if len(releases) < page_size:
                    return out
                page += 1
                next_path = "/api/OCDSReleases"
                next_params = {
                    "dateFrom": date_from,
                    "dateTo": date_to,
                    "PageNumber": page,
                    "PageSize": page_size,
                }
        # Safety net: if we got here, pagination looped past max_pages.
        raise EtendersError("pagination exceeded max_pages; aborting")
