"""In-memory TTL cache."""
from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Generic, TypeVar

K = TypeVar("K")
V = TypeVar("V")


@dataclass
class _Entry(Generic[V]):
    value: V
    expires_at: float


class TTLCache(Generic[K, V]):
    def __init__(self, ttl_seconds: int) -> None:
        self._ttl = ttl_seconds
        self._store: dict[K, _Entry[V]] = {}
        self._locks: dict[K, asyncio.Lock] = {}
        self._registry_lock = asyncio.Lock()

    async def get_or_load(
        self, key: K, loader: Callable[[], Awaitable[V]],
    ) -> V:
        now = time.monotonic()
        entry = self._store.get(key)
        if entry is not None and entry.expires_at > now:
            return entry.value
        # Single-flight: only one loader call per key in flight.
        async with self._registry_lock:
            lock = self._locks.get(key)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[key] = lock
        async with lock:
            entry = self._store.get(key)
            if entry is not None and entry.expires_at > now:
                return entry.value
            value = await loader()
            # Re-capture `now` so the TTL window starts when the loader finished,
            # not when the caller first hit the cache.
            self._store[key] = _Entry(
                value=value, expires_at=time.monotonic() + self._ttl,
            )
            return value

    def invalidate(self, key: K) -> None:
        self._store.pop(key, None)
        self._locks.pop(key, None)