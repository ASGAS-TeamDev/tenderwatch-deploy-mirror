"""GET /api/health — probes eTenders and reports config path."""
from __future__ import annotations

import httpx
from fastapi import APIRouter

from app.models import HealthResponse
from app.settings import settings

router = APIRouter()


@router.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.api_base.rstrip('/')}/api/OCDSReleases",
                params={"PageSize": 1},
            )
            ok = resp.status_code < 500
    except httpx.HTTPError:
        ok = False
    return HealthResponse(
        ok=ok,
        etenders_reachable=ok,
        config_path=settings.config_path,
    )
