"""
tests/test_api_auth_integration.py — PH2/PH3 end-to-end through the ASGI app,
ES256 signing.

Auth enabled (SUPABASE_URL set + injected signing key): anonymous requests to
protected routers get 401; a valid ES256 bearer passes the gate. Health stays
public. The retired saved store never serves data (410 when authed, 401 when
not).
"""

from __future__ import annotations

import json

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


# ── feed diagnostics: authenticated + shaped, no secrets ────────────────────────

def test_feed_status_requires_auth(client, auth_on):
    assert client.get("/api/feed/status").status_code == 401


def test_feed_status_exposes_diagnostics_without_secrets(client, auth_on):
    r = client.get("/api/feed/status", headers=_bearer())
    assert r.status_code == 200
    body = r.json()
    assert "diagnostics" in body
    diag = body["diagnostics"]
    assert "refresher" in diag and "targets" in diag
    blob = r.text.lower()
    for banned in ("authorization", "cookie", "bearer", "sb_secret", "eyj", "password"):
        assert banned not in blob


# ── finding 1: diagnostics-store failure must PROPAGATE (not be masked) ──────────

class _TargetsBomb:
    """Stand-in for DiagnosticsStore._targets whose every access raises a
    secret-bearing exception — drives status_for onto its unavailable fallback."""
    _MSG = ("boom Authorization: Bearer eyJq.eyJr.leaked-sig "
            "sb_secret_ABC123 password=SuperS3cret api_key=sk-proj-LEAK999")
    def get(self, *a, **k):        raise RuntimeError(self._MSG)
    def __getitem__(self, *a, **k): raise RuntimeError(self._MSG)
    def __setitem__(self, *a, **k): raise RuntimeError(self._MSG)


_BOMB_SECRETS = ["eyJq", "leaked-sig", "sb_secret_ABC123", "SuperS3cret", "sk-proj-LEAK999"]


def test_build_diagnostics_propagates_unavailable_state(monkeypatch):
    """Force the REAL status_for failure path through _build_diagnostics()."""
    from app.diagnostics import diagnostics as store
    from api.routes.feed import _build_diagnostics
    monkeypatch.setattr(store, "_targets", _TargetsBomb())

    diag = _build_diagnostics()
    assert diag["targets"], "expected warm targets"
    for t in diag["targets"]:
        assert t["diagnostics_available"] is False
        assert t["diagnostics_error"]["error_code"] == "DIAGNOSTICS_STORE_FAILED"
        # NOT reconstructed as a normal record full of nulls
        assert "last_attempt_at" not in t
        assert "persistence" not in t
    blob = json.dumps(diag)
    for secret in _BOMB_SECRETS:
        assert secret not in blob


def test_feed_status_endpoint_surfaces_unavailable_without_secrets(client, auth_on, monkeypatch):
    """Force it through authenticated GET /api/feed/status."""
    from app.diagnostics import diagnostics as store
    monkeypatch.setattr(store, "_targets", _TargetsBomb())

    r = client.get("/api/feed/status", headers=_bearer())
    assert r.status_code == 200
    targets = r.json()["diagnostics"]["targets"]
    assert targets and all(t["diagnostics_available"] is False for t in targets)
    assert all(t["diagnostics_error"]["error_code"] == "DIAGNOSTICS_STORE_FAILED"
               for t in targets)
    for secret in _BOMB_SECRETS:
        assert secret not in r.text


def test_feed_status_healthy_and_uninitialized_distinct_from_unavailable(client, auth_on):
    """A working store (healthy or merely uninitialized) reports
    diagnostics_available=True with the full record shape — distinguishable from
    the unavailable fallback (which the previous test proved is False)."""
    r = client.get("/api/feed/status", headers=_bearer())
    targets = r.json()["diagnostics"]["targets"]
    assert targets
    for t in targets:
        assert t["diagnostics_available"] is True
        assert "diagnostics_error" not in t
        # full record shape present even when uninitialized (values may be null)
        assert "last_attempt_at" in t and "persistence" in t
