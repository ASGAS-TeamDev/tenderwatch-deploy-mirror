"""Async client for the eTenders OCDS Public API.

Base URL: https://ocds-api.etenders.gov.za (was data.etenders.gov.za; relocated).
Endpoint: GET /api/OCDSReleases?dateFrom=...&dateTo=...&PageNumber=...&PageSize=...

We follow `links.next` if present (the API returns a full absolute URL with
its own query string), and fall back to incrementing PageNumber otherwise.
"""
from __future__ import annotations

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
            # When following `links.next` it's already an absolute URL, so
            # pass an empty base. httpx accepts an absolute URL in `url`.
            if next_path.startswith("http://") or next_path.startswith("https://"):
                resp = await self._client.get(next_path)
            else:
                resp = await self._client.get(next_path, params=next_params)

            if resp.status_code >= 500:
                raise EtendersError(f"upstream {resp.status_code}")
            resp.raise_for_status()
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
