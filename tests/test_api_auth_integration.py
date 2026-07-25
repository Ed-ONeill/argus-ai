"""
tests/test_api_auth_integration.py — PH2/PH3 end-to-end through the ASGI app,
ES256 signing.

Auth enabled (SUPABASE_URL set + injected signing key): anonymous requests to
protected routers get 401; a valid ES256 bearer passes the gate. Health stays
public. The retired saved store never serves data (410 when authed, 401 when
not).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.config import settings
from tests.test_auth import _PUB, mint, _claims


@pytest.fixture
def client():
    from api.main import app
    return TestClient(app)


@pytest.fixture
def auth_on(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "https://proj.supabase.co")
    monkeypatch.setattr(settings, "argus_auth_disabled", False)
    monkeypatch.setattr(auth, "resolve_signing_key", lambda token: _PUB)


def _bearer(**over) -> dict:
    return {"Authorization": f"Bearer {mint(_claims(**over))}"}


# ── health stays public ─────────────────────────────────────────────────────────

def test_health_is_public_even_with_auth_on(client, auth_on):
    assert client.get("/api/health").status_code == 200


# ── protected routers reject anonymous when auth is enabled ─────────────────────

@pytest.mark.parametrize("path", [
    "/api/feed/", "/api/memory/v2/status", "/api/listen/", "/api/saved/",
])
def test_anonymous_rejected_when_auth_enabled(client, auth_on, path):
    assert client.get(path).status_code == 401


@pytest.mark.parametrize("path", ["/api/feed/", "/api/memory/v2/status"])
def test_invalid_token_rejected(client, auth_on, path):
    assert client.get(path, headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_valid_token_passes_the_gate(client, auth_on):
    r = client.get("/api/memory/v2/status", headers=_bearer())
    assert r.status_code != 401


def test_expired_token_rejected(client, auth_on):
    import time
    r = client.get("/api/feed/", headers=_bearer(exp=int(time.time()) - 100))
    assert r.status_code == 401


# ── auth disabled (dev/test default): open, existing behavior preserved ─────────

def test_open_when_auth_disabled(client, monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")
    assert settings.auth_enabled is False
    assert client.get("/api/memory/v2/status").status_code != 401


# ── PH3: saved store retired ────────────────────────────────────────────────────

def test_saved_endpoints_are_gone_when_authed(client, auth_on):
    for method, path in [("get", "/api/saved/"), ("get", "/api/saved/ids/"),
                         ("delete", "/api/saved/abc/")]:
        r = getattr(client, method)(path, headers=_bearer())
        assert r.status_code == 410, f"{method} {path} -> {r.status_code}"


def test_saved_endpoints_401_before_410_when_anonymous(client, auth_on):
    assert client.get("/api/saved/").status_code == 401
