"""Deploy pre-flight: verify the tender Postgres (TW_DATABASE_URL) is
reachable and the nightly n8n sync has populated it.

Reads TW_DATABASE_URL from the environment / backend/.env via settings —
never hardcodes credentials.

Usage (from backend/):
    .venv\\Scripts\\python scripts\\check_db.py
"""
import asyncio

import asyncpg

from app.settings import settings

URL = settings.database_url


async def main() -> None:
    if not URL:
        raise SystemExit("TW_DATABASE_URL is not set — nothing to check.")
    conn = await asyncpg.connect(URL, timeout=10)
    try:
        tables = await conn.fetch(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
        )
        print("TABLES:", [t["table_name"] for t in tables])
        n = await conn.fetchval("SELECT count(*) FROM tenders")
        print("tenders row count:", n)
        last = await conn.fetchrow("SELECT * FROM sync_runs ORDER BY finished_at DESC LIMIT 1")
        print("last sync:", dict(last))
        recent = await conn.fetchval(
            "SELECT count(*) FROM tenders WHERE release_date >= now() - interval '30 days'"
        )
        print("tenders in last 30 days:", recent)
    finally:
        await conn.close()


asyncio.run(main())
