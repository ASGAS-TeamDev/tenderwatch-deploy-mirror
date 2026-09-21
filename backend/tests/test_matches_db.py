"""Tests for the Postgres-vs-live-fetch dispatch in routes/matches.py.

`TW_DATABASE_URL` (settings.database_url) picks the data source:
empty -> live eTenders fetch (today's behaviour, exercised in
test_api.py); set -> read from Postgres via app.services.db, no
upstream HTTP call at all.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def _reset_matches_cache():
    import app.routes.matches as m

    m._cache._store.clear()  # type: ignore[attr-defined]
    m._last_good = None
    yield
    m._cache._store.clear()  # type: ignore[attr-defined]
    m._last_good = None


@pytest.fixture
def client(tmp_path, monkeypatch):
    cfg_path = tmp_path / "tender-watch.json"
    monkeypatch.setattr("app.routes.matches.settings.config_path", str(cfg_path))
    monkeypatch.setattr("app.routes.config.settings.config_path", str(cfg_path))
    monkeypatch.setattr("app.routes.matches.settings.database_url", "postgresql://test/db")
    return TestClient(app)


def _release(ocid: str) -> dict:
    return {
        "ocid": ocid,
        "date": "2026-09-10T00:00:00Z",
        "tender": {
            "status": "active",
            "title": "Provision of cloud hosting services",
            "buyer": {"name": "SITA"},
            "procuringEntity": {"name": "SITA"},
        },
    }


def test_matches_reads_from_db_not_upstream(client, monkeypatch):
    """No upstream HTTP call should happen at all when the DB is configured."""
    from app import routes
    from app.config_store import save_config
    from app.models import Config

    # Deliberately independent of the app's built-in DEFAULT_KEYWORDS (those
    # are business-specific and change over time) — this test only cares
    # that a DB-sourced release still gets filtered, not what the defaults are.
    save_config(Config(keywords=["cloud"], buyer_allowlist=[]), routes.config.settings.config_path)

    called = {"upstream": False}

    async def fake_fetch_upstream(*args, **kwargs):
        called["upstream"] = True
        raise AssertionError("should not hit the live eTenders API when DB is configured")

    async def fake_fetch_releases_from_db(window_days: int):
        return [_release("ocds-db-1")]

    async def fake_fetch_last_sync():
        return datetime(2026, 9, 17, 2, 15, tzinfo=timezone.utc)

    monkeypatch.setattr(
        "app.services.etenders.EtendersClient.fetch_releases", fake_fetch_upstream,
    )
    monkeypatch.setattr(
        "app.services.db.fetch_releases_from_db", fake_fetch_releases_from_db,
    )
    monkeypatch.setattr("app.services.db.fetch_last_sync", fake_fetch_last_sync)

    resp = client.get("/api/matches")
    assert resp.status_code == 200
    data = resp.json()
    assert not called["upstream"]
    assert data["stats"]["matched"] == 1
    assert data["matches"][0]["ocid"] == "ocds-db-1"
    # fetched_at reflects the DB sync time, not "now".
    assert data["fetched_at"].startswith("2026-09-17T02:15")


def test_matches_db_unavailable_returns_503(client, monkeypatch):
    async def fake_fetch_releases_from_db(window_days: int):
        raise ConnectionError("could not connect to server")

    monkeypatch.setattr(
        "app.services.db.fetch_releases_from_db", fake_fetch_releases_from_db,
    )

    resp = client.get("/api/matches")
    assert resp.status_code == 503
    assert resp.json()["detail"]["error"] == "upstream_unavailable"


def test_health_reports_last_synced_at_when_db_configured(monkeypatch, tmp_path):
    monkeypatch.setattr("app.routes.health.settings.database_url", "postgresql://test/db")

    async def fake_fetch_last_sync():
        return datetime(2026, 9, 17, 2, 15, tzinfo=timezone.utc)

    monkeypatch.setattr("app.services.db.fetch_last_sync", fake_fetch_last_sync)

    client = TestClient(app)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["last_synced_at"].startswith("2026-09-17T02:15")


def test_health_last_synced_at_null_without_db(tmp_path):
    client = TestClient(app)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["last_synced_at"] is None
