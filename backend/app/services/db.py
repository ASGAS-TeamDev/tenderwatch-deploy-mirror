"""Postgres access for the n8n-synced tender data (see routes/matches.py).

A nightly n8n workflow fetches eTenders releases and upserts them into
`tenders` (raw release JSON, keyed by ocid) and records each run in
`sync_runs`. This module only ever reads — writing is n8n's job, via its
own, separately-scoped Postgres credential.

Connection pool is created lazily and reused for the life of the process;
it's a no-op when `settings.database_url` is empty (DB disabled).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

import asyncpg

from app.settings import settings

log = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def _get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=5)
    return _pool


async def fetch_releases_from_db(window_days: int) -> list[dict[str, Any]]:
    """All releases whose release_date falls in the last `window_days`."""
    pool = await _get_pool()
    rows = await pool.fetch(
        "SELECT release FROM tenders "
        "WHERE release_date >= now() - ($1 || ' days')::interval",
        str(window_days),
    )
    return [json.loads(row["release"]) for row in rows]


async def fetch_last_sync() -> datetime | None:
    """`finished_at` of the most recent successful sync run, or None."""
    pool = await _get_pool()
    row = await pool.fetchrow(
        "SELECT finished_at FROM sync_runs "
        "WHERE status = 'success' ORDER BY finished_at DESC LIMIT 1",
    )
    return row["finished_at"] if row else None
