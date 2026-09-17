"""FastAPI entry point."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import config as config_routes
from app.routes import health as health_routes
from app.routes import matches as matches_routes
from app.settings import settings

log = logging.getLogger(__name__)

# Recurring warmer interval: half the TTL, so the cache refreshes before
# it ever goes stale (best-effort; if a warm fails the next request
# cold-loads via stale-while-revalidate).
_WARM_INTERVAL = max(settings.cache_ttl_seconds // 2, 15)


async def _recurring_warmer() -> None:
    """Background task that re-warms the default cache key on a schedule."""
    while True:
        try:
            await matches_routes.warm_default_cache()
        except Exception:  # pragma: no cover — defensive
            log.exception("recurring warmer iteration failed")
        await asyncio.sleep(_WARM_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: pre-warm the cache, then start the recurring warmer."""
    # Warm at boot so the first user after a restart doesn't pay the cold
    # fetch. Run in a task so a slow upstream doesn't block app startup —
    # uvicorn can start serving (health/config) immediately.
    warm_task = asyncio.create_task(matches_routes.warm_default_cache())
    warmer = asyncio.create_task(_recurring_warmer())
    try:
        yield
    finally:
        warmer.cancel()
        warm_task.cancel()
        await asyncio.gather(warmer, warm_task, return_exceptions=True)


def create_app(origins: list[str] | None = None) -> FastAPI:
    """Construct the FastAPI app.

    Args:
        origins: CORS allowlist. If empty (or None), CORSMiddleware is not
            attached — the deployment is expected to be same-origin
            (Caddy reverse-proxying /api/* in front of this process).
            Pass a non-empty list when serving cross-origin (e.g. local
            dev where the SPA runs on a different port).
    """
    if origins is None:
        origins = settings.allowed_origins_list
    app = FastAPI(title="Tender Watch", version="0.2.0", lifespan=lifespan)
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=False,
            allow_methods=["GET", "PUT", "OPTIONS"],
            allow_headers=["*"],
        )
    app.include_router(health_routes.router)
    app.include_router(matches_routes.router)
    app.include_router(config_routes.router)
    return app


# Configure logging once at import time (matches prior behaviour).
logging.basicConfig(level=settings.log_level)

# Module-level app for uvicorn. Pass --origins via TW_ALLOWED_ORIGINS env var
# in dev (default: http://localhost:5173) or set TW_ALLOWED_ORIGINS="" in
# production for same-origin (no CORS middleware attached).
app = create_app()
