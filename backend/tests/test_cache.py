"""Tests for the TTL cache. Covers T4."""
from __future__ import annotations

import asyncio

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


# --- Stale-while-revalidate -----------------------------------------------


@pytest.mark.asyncio
async def test_swr_fresh_returns_immediately() -> None:
    cache: TTLCache[str, int] = TTLCache(ttl_seconds=60)
    calls = 0

    async def loader() -> int:
        nonlocal calls
        calls += 1
        return 42

    v1 = await cache.get_or_load_stale("k", loader)
    v2 = await cache.get_or_load_stale("k", loader)
    assert v1 == 42
    assert v2 == 42
    assert calls == 1


@pytest.mark.asyncio
async def test_swr_stale_serves_old_and_refreshes_background() -> None:
    cache: TTLCache[str, int] = TTLCache(ttl_seconds=0.1)
    calls = 0

    async def loader() -> int:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.05)  # simulate slow upstream
        return calls  # 1 then 2

    # Cold — blocks, populates with 1.
    v1 = await cache.get_or_load_stale("k", loader)
    assert v1 == 1
    assert calls == 1

    await asyncio.sleep(0.2)  # let it go stale

    # Stale — returns 1 immediately and refreshes in the background.
    v2 = await cache.get_or_load_stale("k", loader)
    assert v2 == 1  # stale value served, not blocked
    assert calls == 1  # background task just spawned, hasn't run yet

    # Let the background refresh complete.
    await asyncio.sleep(0.1)
    assert calls == 2

    # Next read sees the refreshed value.
    v3 = await cache.get_or_load_stale("k", loader)
    assert v3 == 2


@pytest.mark.asyncio
async def test_swr_single_flight_on_refresh() -> None:
    cache: TTLCache[str, int] = TTLCache(ttl_seconds=0.1)
    calls = 0

    async def loader() -> int:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.05)
        return calls

    await cache.get_or_load_stale("k", loader)
    await asyncio.sleep(0.2)  # stale

    # Fire several stale reads concurrently — only one background refresh.
    results = await asyncio.gather(*[cache.get_or_load_stale("k", loader) for _ in range(5)])
    assert all(r == 1 for r in results)  # all got stale value
    await asyncio.sleep(0.1)  # let the single refresh finish
    assert calls == 2  # one cold + one refresh, not 6


@pytest.mark.asyncio
async def test_swr_background_refresh_failure_keeps_stale() -> None:
    cache: TTLCache[str, int] = TTLCache(ttl_seconds=0.1)

    state = {"v": 1}

    async def loader() -> int:
        v = state["v"]
        if v == 2:
            raise RuntimeError("upstream down")
        return v

    v1 = await cache.get_or_load_stale("k", loader)
    assert v1 == 1
    await asyncio.sleep(0.2)  # stale

    # Flip loader to fail, then trigger a stale read.
    state["v"] = 2
    v2 = await cache.get_or_load_stale("k", loader)
    assert v2 == 1  # stale served
    await asyncio.sleep(0.1)  # let the failed refresh run
    # Stale value is still there — failure didn't evict it.
    assert cache.get_stale("k") == 1


@pytest.mark.asyncio
async def test_swr_get_stale_returns_anything() -> None:
    cache: TTLCache[str, int] = TTLCache(ttl_seconds=0.1)
    assert cache.get_stale("absent") is None
    await cache.get_or_load_stale("k", lambda: _const(7))
    await asyncio.sleep(0.2)  # stale now
    assert cache.get("k") is None  # expired → None
    assert cache.get_stale("k") == 7  # but stale still there
