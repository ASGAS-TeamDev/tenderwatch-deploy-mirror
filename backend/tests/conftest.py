"""Shared test fixtures."""
from __future__ import annotations

import pytest

from app.models import Config


@pytest.fixture
def default_config() -> Config:
    return Config(
        lookback_days=7,
        page_size=100,
        high_value_threshold_zar=5_000_000,
        closing_soon_days=7,
        include_closed=True,
        keywords=[
            "software", "it services", "system integration",
            "consulting", "professional services", "managed services",
            "cloud", "cybersecurity", "data", "development",
            "support and maintenance",
        ],
        buyer_allowlist=["sita", "national treasury", "sars", "dcdt", "gcis"],
    )
