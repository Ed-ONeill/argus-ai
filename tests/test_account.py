"""tests/test_account.py — H6 account-deletion endpoint.

Covers the three required behaviors: (1) unauthorized deletion is rejected, (2) an authenticated
caller deletes exactly THEIR OWN verified identity (the id comes from the JWT sub, never a client
input) and gets a success signal, (3) a backend/admin failure surfaces an error and NEVER reports
success. Plus a guard: the dev/test open path's pseudo-user is never deletable.

The Supabase admin call is mocked — these tests never touch a real Supabase project.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.config import settings
from app.supabase_admin import SupabaseAdminError
from tests.test_auth import _PUB, _claims, mint


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


def test_delete_account_rejects_unauthorized(client, auth_on):
    assert client.delete("/api/account/").status_code == 401
    assert client.delete("/api/account/", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_delete_account_deletes_only_the_verified_user(client, auth_on, monkeypatch):
    called: dict[str, str] = {}
    monkeypatch.setattr("api.routes.account.delete_auth_user", lambda uid: called.__setitem__("uid", uid))
    r = client.delete("/api/account/", headers=_bearer(sub="user-xyz"))
    assert r.status_code == 200
    assert r.json() == {"deleted": True}
    # The id must come from the verified JWT sub, not from any client-supplied value.
    assert called["uid"] == "user-xyz"


def test_delete_account_failure_never_reports_success(client, auth_on, monkeypatch):
    def boom(_uid):
        raise SupabaseAdminError("upstream failure")
    monkeypatch.setattr("api.routes.account.delete_auth_user", boom)
    r = client.delete("/api/account/", headers=_bearer())
    assert r.status_code == 502
    assert r.json().get("deleted") is not True


def test_delete_account_refuses_dev_open_pseudo_user(client, monkeypatch):
    # Auth disabled => require_user yields the dev-open pseudo-identity; deletion must be refused.
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")
    called = {"hit": False}
    monkeypatch.setattr("api.routes.account.delete_auth_user", lambda uid: called.__setitem__("hit", True))
    r = client.delete("/api/account/")
    assert r.status_code == 403
    assert called["hit"] is False
