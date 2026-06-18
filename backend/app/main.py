"""FastAPI entry point."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import config as config_routes
from app.routes import health as health_routes
from app.routes import matches as matches_routes
from app.settings import settings

logging.basicConfig(level=settings.log_level)

app = FastAPI(title="Tender Watch", version="0.1.0")

# CORS: allow only the configured origins. Anything else → 403.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "PUT", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health_routes.router)
app.include_router(matches_routes.router)
app.include_router(config_routes.router)
