"""Tests for the filter pipeline. Covers T8–T12."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path


from app.models import Config
from app.services.filter import apply_rules

FIXTURES = Path(__file__).parent / "fixtures"


def _release(name: str) -> dict:
    # sample_release.json is a bare release object; sample_page.json is wrapped
    # in {"releases": [...]}. Detect which is which.
    data = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
    return data["releases"][0] if "releases" in data else data


def test_cancelled_tender_is_dropped(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["status"] = "cancelled"
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is False
    assert "status:cancelled" in result.reasons


def test_no_keyword_no_buyer_is_dropped(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["buyer"]["name"] = "Acme Holdings"
    r["tender"]["procuringEntity"]["name"] = "Acme Holdings"
    r["tender"]["title"] = "Catering services for the office"
    r["tender"]["description"] = "Catering services for the office canteen"
    r["tender"]["category"] = "Catering"
    r["tender"]["procurementMethodDetails"] = "Request for Quotation"
    r["tender"]["items"] = [{"classification": {"description": "Food"}}]
    result = apply_rules(
        r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc),
    )
    assert result.keep is False
    assert "no_keyword_no_buyer" in result.reasons


def test_high_value_flag(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["value"]["amount"] = 10_000_000
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert "high-value" in result.flags


def test_closing_soon_flag(default_config: Config) -> None:
    r = _release("sample_release.json")
    # Set closing date 2 days from "now"
    r["tender"]["tenderPeriod"]["endDate"] = (
        datetime(2026, 6, 17, tzinfo=timezone.utc) + timedelta(days=2)
    ).isoformat()
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert "closing-soon" in result.flags


def test_buyer_match_keeps_release_without_keyword(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["title"] = "Something unrelated"
    r["tender"]["items"] = []
    r["tender"]["buyer"]["name"] = "SITA"
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert result.matched_on["buyers"] == ["sita"]


def test_keyword_match_keeps_release_without_buyer(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["buyer"]["name"] = "Acme"
    r["tender"]["procuringEntity"]["name"] = "Acme"
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert "cloud" in result.matched_on["keywords"]


def test_value_amount_rounding_to_zar(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["value"] = {"amount": 12345678.9, "currency": "ZAR"}
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert result.value_zar == 12345678.9
    assert result.value_display.startswith("R")
