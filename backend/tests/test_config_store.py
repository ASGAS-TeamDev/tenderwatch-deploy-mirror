"""Tests for config persistence."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.config_store import load_config, save_config
from app.models import Config


def test_load_config_returns_defaults_when_missing(tmp_path: Path) -> None:
    cfg = load_config(tmp_path / "tender-watch.json")
    assert cfg.lookback_days == 30
    assert cfg.page_size == 100
    assert "software" in cfg.keywords


def test_save_then_load_round_trip(tmp_path: Path) -> None:
    path = tmp_path / "tender-watch.json"
    cfg = Config(lookback_days=60, keywords=["alpha", "beta"])
    save_config(cfg, path)
    loaded = load_config(path)
    assert loaded.lookback_days == 60
    assert loaded.keywords == ["alpha", "beta"]


def test_save_config_writes_atomically(tmp_path: Path) -> None:
    path = tmp_path / "tender-watch.json"
    save_config(Config(lookback_days=14), path)
    # No stray .tmp files left behind.
    assert list(tmp_path.glob("*.tmp")) == []


def test_load_config_recovers_from_corrupt_file(tmp_path: Path) -> None:
    path = tmp_path / "tender-watch.json"
    path.write_text("{not valid json", encoding="utf-8")
    cfg = load_config(path)
    # Corrupt file → fall back to defaults (and don't raise).
    assert cfg.lookback_days == 30