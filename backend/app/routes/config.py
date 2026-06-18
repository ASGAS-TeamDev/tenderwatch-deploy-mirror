"""GET /api/config, PUT /api/config — read and replace the user-editable config."""
from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter

from app.config_store import load_config, save_config
from app.models import Config, ConfigResponse
from app.settings import settings

router = APIRouter()


def _digest(config: Config) -> str:
    blob = json.dumps(config.model_dump(), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


@router.get("/api/config", response_model=ConfigResponse)
async def get_config() -> ConfigResponse:
    cfg = load_config(settings.config_path)
    return ConfigResponse(config=cfg, config_digest=_digest(cfg))


@router.put("/api/config", response_model=ConfigResponse)
async def put_config(body: Config) -> ConfigResponse:
    save_config(body, settings.config_path)
    # Cache invalidation is the caller's responsibility (?bust=<ts>) — see spec §4.3.
    return ConfigResponse(config=body, config_digest=_digest(body))
