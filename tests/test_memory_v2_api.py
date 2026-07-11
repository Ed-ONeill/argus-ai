"""Read-only /api/memory/v2 endpoints: UID validation, honest empties,
disabled mode, no raw database exceptions."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import memory_v2
from app.institutional_memory.snapshot_builder import build_theme_snapshot
from tests.conftest import FakeRepository, make_theme

NOW = datetime(2026, 7, 11, 14, 30, tzinfo=timezone.utc)


@pytest.fixture
def client(fake_repo, enabled_settings, monkeypatch):
    monkeypatch.setattr(memory_v2, "_repo", fake_repo)
    app = FastAPI()
    app.include_router(memory_v2.router, prefix="/api/memory/v2")
    return TestClient(app)


@pytest.fixture
def disabled_client(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "institutional_memory_enabled", False)
    monkeypatch.setattr(memory_v2, "_repo", None)
    app = FastAPI()
    app.include_router(memory_v2.router, prefix="/api/memory/v2")
    return TestClient(app)


def _seed(fake_repo):
    snap = build_theme_snapshot(make_theme(), None, NOW)
    fake_repo.insert_snapshot(snap)


def test_invalid_uid_rejected(client):
    resp = client.get("/api/memory/v2/themes/theme:bogus:x/snapshots")
    assert resp.status_code == 400
    assert "Invalid theme UID" in resp.json()["detail"]


def test_invalid_date_rejected(client):
    resp = client.get("/api/memory/v2/themes/ai-energy-demand/snapshots",
                      params={"date_from": "yesterday"})
    assert resp.status_code == 400


def test_empty_history_returns_honest_empty(client):
    resp = client.get("/api/memory/v2/themes/ai-energy-demand/snapshots")
    assert resp.status_code == 200
    assert resp.json() == {"theme_uid": "theme:ontology:ai-energy-demand",
                           "count": 0, "snapshots": []}


def test_snapshots_accept_bare_id_and_full_uid(client, fake_repo):
    _seed(fake_repo)
    bare = client.get("/api/memory/v2/themes/ai-energy-demand/snapshots").json()
    full = client.get(
        "/api/memory/v2/themes/theme:ontology:ai-energy-demand/snapshots").json()
    assert bare["count"] == full["count"] == 1


def test_latest_404_when_no_history(client):
    resp = client.get("/api/memory/v2/themes/treasury-yield-pressure/latest")
    assert resp.status_code == 404


def test_latest_returns_snapshot(client, fake_repo):
    _seed(fake_repo)
    resp = client.get("/api/memory/v2/themes/ai-energy-demand/latest")
    assert resp.status_code == 200
    assert resp.json()["snapshot"]["conviction"] == 72


def test_status_reports_counts_and_runs(client, fake_repo):
    _seed(fake_repo)
    resp = client.get("/api/memory/v2/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is True
    assert body["writer_version"]
    assert body["snapshot_count"] == 1
    assert body["latest_snapshot_date"] == "2026-07-11"
    assert body["recent_write_errors"] == []


def test_disabled_status_and_503(disabled_client):
    status = disabled_client.get("/api/memory/v2/status")
    assert status.status_code == 200
    assert status.json()["enabled"] is False
    assert status.json()["reason"] == "disabled_by_flag"

    resp = disabled_client.get("/api/memory/v2/themes/ai-energy-demand/snapshots")
    assert resp.status_code == 503


def test_repository_error_hidden_from_client(client, fake_repo):
    fake_repo.fail_on.add("list_snapshots")
    resp = client.get("/api/memory/v2/themes/ai-energy-demand/snapshots")
    assert resp.status_code == 502
    assert "injected failure" not in resp.text        # raw error not exposed
