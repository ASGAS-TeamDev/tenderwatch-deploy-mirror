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
        assert route.call_count == 2
    assert len(releases) == 1
