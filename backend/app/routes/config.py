"""GET /api/config, PUT /api/config — read and replace the user-editable config."""
from __future__ import annotations

import asyncio
import hashlib
import json

from fastapi import APIRouter, Header, HTTPException

from app.config_store import load_config, save_config
from app.models import Config, ConfigResponse
from app.settings import settings

router = APIRouter()

# Serializes the check-then-write below so two concurrent PUTs can't both
# pass the If-Match check against the same stale digest before either writes.
_write_lock = asyncio.Lock()


def _digest(config: Config) -> str:
    blob = json.dumps(config.model_dump(), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


@router.get("/api/config", response_model=ConfigResponse)
async def get_config() -> ConfigResponse:
    cfg = load_config(settings.config_path)
    return ConfigResponse(config=cfg, config_digest=_digest(cfg))


@router.put("/api/config", response_model=ConfigResponse)
async def put_config(
    body: Config, if_match: str | None = Header(default=None, alias="If-Match"),
) -> ConfigResponse:
    """Save the config, with optimistic concurrency when `If-Match` is sent.

    There's no per-user auth — this file is shared by everyone who opens the
    app. If a caller sends `If-Match: <digest it loaded>` and the on-disk
    config has since changed (someone else saved in the meantime), reject
    with 409 rather than silently overwriting their edit. Callers that don't
    send `If-Match` skip the check (kept optional for other API consumers).
    """
    async with _write_lock:
        if if_match is not None:
            current = load_config(settings.config_path)
            current_digest = _digest(current)
            if current_digest != if_match:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "error": "config_modified",
                        "current_config": current.model_dump(),
                        "current_digest": current_digest,
                    },
                )
        save_config(body, settings.config_path)
    # Cache invalidation is the caller's responsibility (?bust=<ts>) — see spec §4.3.
    return ConfigResponse(config=body, config_digest=_digest(body))
