"""Read/write the user-editable config JSON. Atomic write; defaults on missing/corrupt."""
from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path

from app.models import Config

log = logging.getLogger(__name__)


def load_config(path: str | Path) -> Config:
    p = Path(path)
    if not p.exists():
        return Config()
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        log.warning("config %s unreadable (%s); using defaults", p, exc)
        return Config()
    try:
        return Config(**data)
    except Exception as exc:  # pydantic ValidationError
        log.warning("config %s invalid (%s); using defaults", p, exc)
        return Config()


def save_config(config: Config, path: str | Path) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    # Atomic write: write to a temp file in the same dir, then os.replace.
    fd, tmp_path = tempfile.mkstemp(dir=p.parent, prefix=".tender-watch-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(config.model_dump(), f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, p)
    except Exception:
        # Best-effort cleanup on failure.
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise