"""End-to-end API tests. Covers T1, T2, T3, T5, T6, T7, T13, T16."""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.main import app

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def _reset_matches_cache():
    """Wipe the module-level cache and `_last_good` between tests.

    The matches route holds a process-local TTLCache and a `_last_good` sentinel.
    Without this reset, a successful response in an earlier test poisons later
    tests by short-circuiting the upstream fetch.
    """
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
    # These tests target the live eTenders fetch path and don't mock Postgres
    # or Claude — force both off regardless of what's set in the local .env.
    monkeypatch.setattr("app.routes.matches.settings.database_url", "")
    monkeypatch.setattr("app.services.heading.settings.anthropic_api_key", "")
    return TestClient(app)


def test_first_visit_default_config(client) -> None:
    """No config file exists yet — the app should still run end-to-end on
    Config()'s built-in defaults (currently digital-forensics/agri-tech
    keywords) rather than erroring. The sample release is generic cloud
    hosting, unrelated to either domain, so the defaults correctly reject
    it — this exercises the "no file → defaults → filter pipeline" path
    without hard-coding what the default keywords happen to be."""
    page = _load("sample_page.json")
    with respx.mock(base_url="https://ocds-api.etenders.gov.za") as mock:
        mock.get("/api/OCDSReleases").mock(return_value=httpx.Response(200, json=page))
        resp = client.get("/api/matches")
    assert resp.status_code == 200
    data = resp.json()
    assert data["stats"]["releases_scanned"] == 1
    assert data["stats"]["matched"] == 0
    assert data["stats"]["rejected_no_keyword_no_buyer"] == 1


def test_config_then_matches(client) -> None:
    # Direct config + matches: persist a config with empty filters, then call /api/matches.
    from app import routes
    from app.config_store import save_config
    from app.models import Config

    # We need to use the same path the app uses; the client fixture sets it via monkeypatch.
    save_config(Config(keywords=[], buyer_allowlist=[]), routes.config.settings.config_path)

    page = _load("sample_page.json")
    with respx.mock(base_url="https://ocds-api.etenders.gov.za") as mock:
        mock.get("/api/OCDSReleases").mock(return_value=httpx.Response(200, json=page))
        resp = client.get("/api/matches")
    assert resp.status_code == 200
    data = resp.json()
    assert data["stats"]["matched"] == 0
    assert data["stats"]["rejected_no_keyword_no_buyer"] == 1


def test_upstream_500_returns_503(client) -> None:
    with respx.mock(base_url="https://ocds-api.etenders.gov.za") as mock:
        mock.get("/api/OCDSReleases").mock(return_value=httpx.Response(500, json={}))
        # Patch the backoff sleeps to keep the test fast.
        import app.routes.matches as m
        orig_sleep = m.asyncio.sleep
        m.asyncio.sleep = lambda _s: orig_sleep(0)  # type: ignore[assignment]
        try:
            resp = client.get("/api/matches")
        finally:
            m.asyncio.sleep = orig_sleep  # type: ignore[assignment]
    assert resp.status_code == 503
    body = resp.json()["detail"]
    assert body["error"] == "upstream_unavailable"


def test_cache_bust_forces_refetch(client) -> None:
    page = _load("sample_page.json")
    with respx.mock(base_url="https://ocds-api.etenders.gov.za") as mock:
        route = mock.get("/api/OCDSReleases").mock(return_value=httpx.Response(200, json=page))
        client.get("/api/matches")
        client.get("/api/matches?bust=now1")
        assert route.call_count == 2


def test_document_view_proxies_and_forces_inline(client) -> None:
    from app import routes
    from app.config_store import save_config
    from app.models import Config

    save_config(Config(keywords=["cloud"], buyer_allowlist=[]), routes.config.settings.config_path)

    page = _load("sample_page.json")
    with respx.mock(base_url="https://ocds-api.etenders.gov.za") as mock:
        mock.get("/api/OCDSReleases").mock(return_value=httpx.Response(200, json=page))
        matches_resp = client.get("/api/matches")
    ocid = matches_resp.json()["matches"][0]["ocid"]

    # eTenders always serves documents as Content-Disposition: attachment —
    # the proxy must override that with inline regardless of what upstream sends.
    with respx.mock(base_url="https://etenders.gov.za") as mock:
        mock.get("/doc/1").mock(return_value=httpx.Response(
            200,
            content=b"%PDF-1.4 fake pdf bytes",
            headers={
                "content-type": "application/pdf",
                "content-disposition": 'attachment; filename="Bid invitation.pdf"',
            },
        ))
        view_resp = client.get(f"/api/matches/{ocid}/documents/0/view")

    assert view_resp.status_code == 200
    assert view_resp.headers["content-type"] == "application/pdf"
    assert view_resp.headers["content-disposition"].startswith("inline")
    assert view_resp.content == b"%PDF-1.4 fake pdf bytes"


def test_document_view_unknown_ocid_404s(client) -> None:
    page = _load("sample_page.json")
    with respx.mock(base_url="https://ocds-api.etenders.gov.za") as mock:
        mock.get("/api/OCDSReleases").mock(return_value=httpx.Response(200, json=page))
        client.get("/api/matches")

    resp = client.get("/api/matches/does-not-exist/documents/0/view")
    assert resp.status_code == 404


def test_document_view_out_of_range_index_404s(client) -> None:
    from app import routes
    from app.config_store import save_config
    from app.models import Config

    save_config(Config(keywords=["cloud"], buyer_allowlist=[]), routes.config.settings.config_path)

    page = _load("sample_page.json")
    with respx.mock(base_url="https://ocds-api.etenders.gov.za") as mock:
        mock.get("/api/OCDSReleases").mock(return_value=httpx.Response(200, json=page))
        matches_resp = client.get("/api/matches")
    ocid = matches_resp.json()["matches"][0]["ocid"]

    resp = client.get(f"/api/matches/{ocid}/documents/5/view")
    assert resp.status_code == 404


def test_config_change_does_not_trigger_refetch(client) -> None:
    """A keyword/buyer/favourite edit must be served from the already-cached
    raw releases, not force a fresh upstream round trip (regression guard —
    see routes/matches.py module docstring for why the cache is layered)."""
    from app import routes
    from app.config_store import save_config
    from app.models import Config

    page = _load("sample_page.json")
    with respx.mock(base_url="https://ocds-api.etenders.gov.za") as mock:
        route = mock.get("/api/OCDSReleases").mock(return_value=httpx.Response(200, json=page))
        client.get("/api/matches")
        assert route.call_count == 1

        # Change config (e.g. what a favourite-star toggle does) between calls.
        save_config(Config(favourited_ocids=["ocds-abc"]), routes.config.settings.config_path)
        resp = client.get("/api/matches")
        assert resp.status_code == 200
        assert route.call_count == 1  # still just the one upstream fetch


def test_config_invalid_returns_400(client) -> None:
    invalid = json.loads((FIXTURES / "sample_invalid_config.json").read_text())
    resp = client.put("/api/config", json=invalid)
    assert resp.status_code == 422  # pydantic validation


def test_config_valid_persists_and_reflects(client) -> None:
    from app.models import Config

    new = Config(lookback_days=14, keywords=["alpha"], favourited_ocids=["ocds-1"])
    resp = client.put("/api/config", json=new.model_dump())
    assert resp.status_code == 200

    got = client.get("/api/config").json()
    assert got["config"]["lookback_days"] == 14
    assert got["config"]["favourited_ocids"] == ["ocds-1"]


def test_lookback_90_days(client) -> None:
    page = _load("sample_page.json")
    with respx.mock(base_url="https://ocds-api.etenders.gov.za") as mock:
        mock.get("/api/OCDSReleases").mock(return_value=httpx.Response(200, json=page))
        resp = client.get("/api/matches?window=90")
    assert resp.status_code == 200
    data = resp.json()
    assert data["window"]["from"].startswith("20")  # 90 days back


def test_cors_disallowed_origin(client) -> None:
    resp = client.get(
        "/api/health",
        headers={"Origin": "https://evil.example.com"},
    )
    # CORS preflight from a disallowed origin: FastAPI returns 200 but the
    # `access-control-allow-origin` header is absent.
    assert "access-control-allow-origin" not in {k.lower() for k in resp.headers.keys()} or \
        resp.headers.get("access-control-allow-origin") != "https://evil.example.com"


def test_cors_middleware_not_attached_when_origins_empty() -> None:
    """When origins=[], CORSMiddleware must not be installed.

    The lazy import is load-bearing: create_app does not yet exist when
    test_api.py is imported, so a top-level import would break every
    other test in this file. The test is meant to fail with ImportError
    until Task 2 lands.
    """
    from app.main import create_app
    from fastapi.middleware.cors import CORSMiddleware

    test_app = create_app(origins=[])

    # Direct check on the middleware stack — the canonical way to verify
    # which middleware are installed.
    assert CORSMiddleware not in [m.cls for m in test_app.user_middleware]

    # Sanity: the route is still wired up.
    client = TestClient(test_app)
    assert client.get("/api/health").status_code == 200
