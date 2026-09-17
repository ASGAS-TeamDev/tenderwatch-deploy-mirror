"""In-memory TTL cache with stale-while-revalidate semantics."""
from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Generic, TypeVar

K = TypeVar("K")
V = TypeVar("V")

log = logging.getLogger(__name__)


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
        # Track background refresh tasks so they can be awaited in tests and
        # so a refresh already in flight isn't spawned twice (single-flight).
        self._refreshing: set[K] = set()

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

    async def get_or_load_stale(
        self, key: K, loader: Callable[[], Awaitable[V]],
    ) -> V:
        """Stale-while-revalidate read.

        - Fresh entry → return immediately.
        - Expired entry present → return the stale value now and fire a
          background refresh (single-flight). The caller never blocks on a
          refresh once a value has been seen at least once.
        - No entry (true cold) → block on the loader, then store.
        """
        now = time.monotonic()
        entry = self._store.get(key)
        if entry is not None:
            if entry.expires_at > now:
                # Fresh — return immediately.
                return entry.value
            # Stale — serve now, refresh in the background.
            self._spawn_refresh(key, loader)
            return entry.value
        # True cold miss — must block to populate the cache.
        return await self.get_or_load(key, loader)

    def _spawn_refresh(self, key: K, loader: Callable[[], Awaitable[V]]) -> None:
        """Fire-and-forget a background refresh, single-flight per key.

        Called from get_or_load_stale (inside the event loop). The
        check-then-add on ``_refreshing`` is atomic in asyncio — no await
        lands between them — so no lock is needed here.
        """
        if key in self._refreshing:
            return  # already refreshing
        self._refreshing.add(key)

        async def _refresh() -> None:
            try:
                # Acquire the per-key lock so a concurrent cold-miss path
                # can't start a second loader for the same key.
                lock = self._locks.get(key)
                if lock is None:
                    async with self._registry_lock:
                        lock = self._locks.get(key)
                        if lock is None:
                            lock = asyncio.Lock()
                            self._locks[key] = lock
                async with lock:
                    value = await loader()
                    self._store[key] = _Entry(
                        value=value, expires_at=time.monotonic() + self._ttl,
                    )
            except Exception:
                # Background refresh failure is non-fatal — the stale entry
                # stays served until the next successful refresh. Log so it
                # isn't silently swallowed.
                log.exception("background cache refresh failed for key")
            finally:
                self._refreshing.discard(key)

        # Create the task on the running loop. create_task is safe here
        # because _spawn_refresh is only called from get_or_load_stale,
        # which runs inside the event loop.
        asyncio.create_task(_refresh())

    def get(self, key: K) -> V | None:
        """Return a fresh entry's value, or None if absent/expired."""
        now = time.monotonic()
        entry = self._store.get(key)
        if entry is not None and entry.expires_at > now:
            return entry.value
        return None

    def get_stale(self, key: K) -> V | None:
        """Return any stored value regardless of freshness (or None)."""
        entry = self._store.get(key)
        return entry.value if entry is not None else None

    def invalidate(self, key: K) -> None:
        self._store.pop(key, None)
        self._locks.pop(key, None)
