"""Async client for the eTenders OCDS Public API."""
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
