"""Tests for the TTL cache. Covers T4."""
from __future__ import annotations

import asyncio
import time

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