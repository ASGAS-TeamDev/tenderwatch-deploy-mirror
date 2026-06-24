"""FastAPI entry point."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import config as config_routes
from app.routes import health as health_routes
from app.routes import matches as matches_routes
from app.settings import settings


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
    app = FastAPI(title="Tender Watch", version="0.2.0")
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