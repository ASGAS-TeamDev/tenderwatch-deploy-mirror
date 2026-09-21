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


def test_show_all_bypasses_no_keyword_no_buyer_rejection(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["buyer"]["name"] = "Acme Holdings"
    r["tender"]["procuringEntity"]["name"] = "Acme Holdings"
    r["tender"]["title"] = "Catering services for the office"
    r["tender"]["description"] = "Catering services for the office canteen"
    r["tender"]["category"] = "Catering"
    r["tender"]["procurementMethodDetails"] = "Request for Quotation"
    r["tender"]["items"] = [{"classification": {"description": "Food"}}]
    result = apply_rules(
        r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc), show_all=True,
    )
    assert result.keep is True
    assert result.matched_on == {"keywords": [], "buyers": []}


def test_show_all_still_hard_rejects_cancelled(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["status"] = "cancelled"
    result = apply_rules(
        r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc), show_all=True,
    )
    assert result.keep is False
    assert "status:cancelled" in result.reasons


def test_match_all_buyers_keeps_release_without_keyword_or_buyer(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["title"] = "Something entirely unrelated"
    r["tender"]["description"] = "Nothing to do with our keywords"
    r["tender"]["items"] = []
    r["tender"]["buyer"]["name"] = "Acme Holdings"
    r["tender"]["procuringEntity"]["name"] = "Acme Holdings"
    config = default_config.model_copy(update={"match_all_buyers": True})
    result = apply_rules(r, config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert result.matched_on["buyers"] == ["(all buyers)"]


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


def test_compulsory_briefing_upcoming_flag(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["briefingSession"] = {
        "isSession": True,
        "compulsory": True,
        "date": "2026-06-20T10:00:00Z",
        "venue": "Microsoft Teams",
    }
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert "briefing-required" in result.flags
    assert "briefing-missed" not in result.flags
    assert result.briefing_session is not None
    assert result.briefing_session["date"] == "2026-06-20T10:00:00Z"


def test_compulsory_briefing_passed_flag(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["briefingSession"] = {
        "isSession": True,
        "compulsory": True,
        "date": "2026-06-10T10:00:00Z",
        "venue": "Microsoft Teams",
    }
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert "briefing-missed" in result.flags
    assert "briefing-required" not in result.flags


def test_compulsory_briefing_date_only_no_time(default_config: Config) -> None:
    # Real eTenders payloads sometimes give a bare date ("2026-09-23") with
    # no time component — must not crash comparing against tz-aware `now`.
    r = _release("sample_release.json")
    r["tender"]["briefingSession"] = {
        "isSession": True,
        "compulsory": True,
        "date": "2026-09-23",
        "venue": "Queens Warehouse, Durban",
    }
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert "briefing-required" in result.flags


def test_non_compulsory_briefing_upcoming_gets_scheduled_flag(default_config: Config) -> None:
    # eTenders' `compulsory` field is unreliable (seen tenders whose actual
    # description demands attendance but the field says false) — every
    # session gets flagged, `compulsory` only changes severity/wording.
    r = _release("sample_release.json")
    r["tender"]["briefingSession"] = {
        "isSession": True,
        "compulsory": False,
        "date": "2026-06-20T10:00:00Z",
        "venue": "Microsoft Teams",
    }
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert "briefing-scheduled" in result.flags
    assert "briefing-required" not in result.flags
    assert "briefing-missed" not in result.flags


def test_non_compulsory_briefing_passed_gets_missed_flag(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["briefingSession"] = {
        "isSession": True,
        "compulsory": False,
        "date": "2026-06-10T10:00:00Z",
        "venue": "Microsoft Teams",
    }
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert "briefing-missed" in result.flags
    assert "briefing-scheduled" not in result.flags


def test_value_amount_rounding_to_zar(default_config: Config) -> None:
    r = _release("sample_release.json")
    r["tender"]["value"] = {"amount": 12345678.9, "currency": "ZAR"}
    result = apply_rules(r, default_config, now=datetime(2026, 6, 17, tzinfo=timezone.utc))
    assert result.keep is True
    assert result.value_zar == 12345678.9
    assert result.value_display.startswith("R")
